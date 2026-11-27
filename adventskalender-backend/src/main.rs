use adventskalender_backend::fairings::BackendConfiguration;
use adventskalender_backend::{Action, build_rocket, log_action};
use chrono::DateTime;
use diesel::PgConnection;
use diesel_migrations::{EmbeddedMigrations, embed_migrations};
use log::LevelFilter;
use ring::signature::Ed25519KeyPair;
use rocket::config::{Shutdown, Sig};
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;
use url::Url;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub fn run_migrations(
    connection: &mut PgConnection,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use diesel_migrations::MigrationHarness;
    use log::info;
    match connection.run_pending_migrations(MIGRATIONS) {
        Ok(ran_migrations) => {
            if !ran_migrations.is_empty() {
                info!(
                    "Successfully ran {} database migrations",
                    ran_migrations.len()
                );
            } else {
                info!("No migrations had to be run since the database is up to date");
            }
            Ok(())
        }
        Err(error) => Err(error),
    }
}

fn setup_logging(logging_level: LevelFilter) {
    use chrono::Utc;

    // create an instance for the Dispatcher to create a new logging configuration
    let mut base_config = fern::Dispatch::new();

    // set the corresponding logging level
    base_config = base_config.level(logging_level);

    // define what a logging line should look like and attach the streams to which the output will be
    // written to
    let file_config = fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "{}[{}][{}] {}",
                Utc::now().format("[%Y-%m-%d][%H:%M:%S]"),
                record.target(),
                record.level(),
                message
            ))
        })
        .chain(std::io::stderr());

    // now chain everything together and get ready for actually logging stuff
    base_config
        .chain(file_config)
        .level_for("reqwest", LevelFilter::Off)
        .level_for("ureq", LevelFilter::Off)
        .level_for("r2d2", LevelFilter::Off)
        .level_for("rustls", LevelFilter::Off)
        .level_for("want", LevelFilter::Off)
        .level_for("mio", LevelFilter::Off)
        .level_for("rocket", LevelFilter::Error)
        .level_for("_", LevelFilter::Error)
        .apply()
        .unwrap();
}

/// The key file which is used when `ADVENTSKALENDER_KEY_FILE_PATH` is not set.
const DEFAULT_KEY_FILE_PATH: &str = "/data/adventskalender_ed25519.key";

/// The validated startup configuration of the backend.
#[derive(Debug)]
struct Settings {
    api_host: String,
    jwks_uri: String,
    database_connection_url: String,
    healthcheck_io_project: String,
    token_audience: HashSet<String>,
    cors_origins: Vec<String>,
    key_file_path: PathBuf,
    cookie_secure: bool,
}

/// Reads the startup configuration through `variable`, which returns the value of the named
/// environment variable. An empty value counts as unset. Returns a message naming the offending
/// variable if a required one is missing or a value is invalid.
fn parse_settings(variable: impl Fn(&str) -> Option<String>) -> Result<Settings, String> {
    let optional = |name: &str| variable(name).filter(|value| !value.is_empty());
    let required = |name: &str| optional(name).ok_or_else(|| format!("{name} must be set"));

    // the API host is the token issuer and the base of the advertised OpenID configuration
    let api_host = required("ADVENTSKALENDER_API_HOST")?;
    let jwks_uri = Url::parse(&api_host)
        .and_then(|url| url.join("/.well-known/jwks.json"))
        .map_err(|error| {
            format!("ADVENTSKALENDER_API_HOST '{api_host}' is not a valid URL: {error}")
        })?
        .to_string();

    let cors_origins: Vec<String> = required("ADVENTSKALENDER_CORS_ORIGINS")?
        .split(',')
        .map(|origin| origin.trim().to_string())
        .filter(|origin| !origin.is_empty())
        .collect();
    if cors_origins.is_empty() {
        return Err("ADVENTSKALENDER_CORS_ORIGINS must list at least one origin".to_string());
    }

    let cookie_secure = match optional("ADVENTSKALENDER_COOKIE_SECURE") {
        None => true,
        Some(value) => match value.to_lowercase().as_str() {
            "true" => true,
            "false" => false,
            _ => {
                return Err(format!(
                    "ADVENTSKALENDER_COOKIE_SECURE must be 'true' or 'false', got '{value}'"
                ));
            }
        },
    };

    Ok(Settings {
        api_host,
        jwks_uri,
        database_connection_url: required("ADVENTSKALENDER_DB_CONNECTION")?,
        healthcheck_io_project: required("ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT")?,
        token_audience: required("ADVENTSKALENDER_TOKEN_AUDIENCE")?
            .split(',')
            .map(|audience| audience.to_string())
            .collect(),
        cors_origins,
        key_file_path: PathBuf::from(
            optional("ADVENTSKALENDER_KEY_FILE_PATH")
                .unwrap_or_else(|| DEFAULT_KEY_FILE_PATH.to_string()),
        ),
        cookie_secure,
    })
}

/// Loads the Ed25519 key pair (PKCS#8 DER) from `key_file_path`. Only a missing file leads to a
/// newly generated key; a file which exists but cannot be read or does not contain a valid key is
/// an error, so that a mis-mounted key is never silently replaced.
fn load_or_generate_keypair(key_file_path: &std::path::Path) -> Result<Vec<u8>, String> {
    use log::info;

    match std::fs::read(key_file_path) {
        Ok(key_bytes) => {
            Ed25519KeyPair::from_pkcs8(&key_bytes).map_err(|error| {
                format!(
                    "The key file {key_file_path:?} does not contain a valid Ed25519 key in the PKCS#8 DER format: {error}"
                )
            })?;
            info!("Loaded the existing Ed25519 key pair from {key_file_path:?}");
            Ok(key_bytes)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            info!("Generating a new Ed25519 key pair and saving it to {key_file_path:?}");
            generate_and_store_keypair(key_file_path)
        }
        Err(error) => Err(format!(
            "Could not read the key file {key_file_path:?}: {error}"
        )),
    }
}

/// Generates a new key pair and stores it atomically: the key is written to a temporary file
/// which only the owner can access, flushed to disk and then renamed to `key_file_path`, so that
/// an interrupted write never leaves a partial key behind.
fn generate_and_store_keypair(key_file_path: &std::path::Path) -> Result<Vec<u8>, String> {
    use std::fs;
    use std::io::Write;

    let key_pair_document = Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new())
        .map_err(|error| format!("Failed to generate an Ed25519 key pair: {error}"))?;

    let file_name = key_file_path
        .file_name()
        .ok_or_else(|| format!("The key file path {key_file_path:?} does not name a file"))?;
    let key_directory = match key_file_path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => std::path::Path::new("."),
    };
    fs::create_dir_all(key_directory)
        .map_err(|error| format!("Failed to create the key directory: {error}"))?;

    let mut temporary_file_name = std::ffi::OsString::from(".");
    temporary_file_name.push(file_name);
    temporary_file_name.push(".tmp");
    let temporary_path = key_directory.join(temporary_file_name);
    match fs::remove_file(&temporary_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Failed to remove the leftover temporary key file {temporary_path:?}: {error}"
            ));
        }
    }

    let write_temporary_file = || -> std::io::Result<()> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let mut file = options.open(&temporary_path)?;
        file.write_all(key_pair_document.as_ref())?;
        file.sync_all()
    };
    if let Err(error) =
        write_temporary_file().and_then(|()| fs::rename(&temporary_path, key_file_path))
    {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!(
            "Failed to write the key file {key_file_path:?}: {error}"
        ));
    }

    // the rename only survives a crash once the directory entry itself is flushed to disk
    #[cfg(unix)]
    fs::File::open(key_directory)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("Failed to flush the key directory to disk: {error}"))?;

    Ok(key_pair_document.as_ref().to_vec())
}

#[rocket::main]
async fn main() {
    use adventskalender_backend::fairings::AdventskalenderDatabaseConnection;
    use log::{error, info};
    use rocket::Config as RocketConfig;
    use std::env;

    // handle the healthcheck subcommand and exit with the corresponding code instead of starting
    // the server, which allows the distroless container to probe its health without curl
    let arguments: Vec<String> = env::args().skip(1).collect();
    if !arguments.is_empty() {
        if arguments != ["healthcheck"] {
            eprintln!("Unknown arguments: {arguments:?}");
            std::process::exit(2);
        }
        match healthcheck("127.0.0.1", "5479", "/v1/health") {
            Ok(()) => std::process::exit(0),
            Err(HealthcheckError::Unhealthy) => {
                eprintln!("The backend is not healthy");
                std::process::exit(1);
            }
            Err(HealthcheckError::RequestFailed { status }) => {
                eprintln!("The health endpoint answered with: {status}");
                std::process::exit(1);
            }
            Err(HealthcheckError::ConnectionFailed { reason }) => {
                eprintln!("Could not reach the backend: {reason}");
                std::process::exit(1);
            }
        }
    }
    // select the logging level from a set environment variable
    let logging_level = match env::var("ADVENTSKALENDER_LOGGING_LEVEL") {
        Ok(value) => match value.to_lowercase().as_str() {
            "trace" => LevelFilter::Trace,
            "debug" => LevelFilter::Debug,
            "info" => LevelFilter::Info,
            "warn" => LevelFilter::Warn,
            "error" => LevelFilter::Error,
            _ => LevelFilter::Info,
        },
        Err(_) => LevelFilter::Info,
    };

    // setup the logging of the application based on the environment variable
    setup_logging(logging_level);

    // just inform the user that we are starting up
    info!(
        "Starting adventskalender backend ({}, build with rustc {})...",
        env!("VERGEN_GIT_DESCRIBE"),
        env!("VERGEN_RUSTC_SEMVER")
    );

    // read and validate the whole configuration before anything else happens, so that a
    // misconfigured deployment refuses to start instead of failing on the first requests
    let settings = match parse_settings(|name| env::var(name).ok()) {
        Ok(settings) => settings,
        Err(error) => {
            error!("Invalid configuration: {error}");
            std::process::exit(1);
        }
    };
    info!("Allowed CORS origins: {}", settings.cors_origins.join(","));
    let cors_header = adventskalender_backend::cors::Cors::new(&settings.cors_origins)
        .unwrap_or_else(|error| {
            error!("Could not build the CORS fairing. The error was: {error}");
            std::process::exit(1);
        });

    // load or generate Ed25519 key pair for signing tokens (persisted across restarts)
    let ed25519_key_bytes = match load_or_generate_keypair(&settings.key_file_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            error!("Failed to load or generate the Ed25519 key pair: {error}");
            std::process::exit(1);
        }
    };
    let backend_config = match BackendConfiguration::from_pkcs8(
        &ed25519_key_bytes,
        settings.api_host,
        settings.jwks_uri,
        settings.healthcheck_io_project,
        settings.token_audience,
        settings.cookie_secure,
    ) {
        Ok(configuration) => configuration,
        Err(error) => {
            error!("Could not use the Ed25519 key pair. The error was: {error}");
            std::process::exit(1);
        }
    };

    let database_connection_url = settings.database_connection_url;

    // create a db connection pool manager and the corresponding pool with retry logic
    info!("Connecting to database with retry logic...");
    let db_connection_pool = {
        let max_retries = 10;
        let mut retry_count = 0;
        let mut backoff_duration = Duration::from_millis(500);

        loop {
            let db_connection_pool_manager =
                diesel::r2d2::ConnectionManager::new(database_connection_url.clone());

            match r2d2::Pool::builder()
                .max_size(15)
                .connection_timeout(Duration::from_secs(5))
                .build(db_connection_pool_manager)
            {
                Ok(pool) => {
                    // Verify we can actually get a connection
                    match pool.get() {
                        Ok(_) => {
                            info!("Successfully connected to the database server");
                            break pool;
                        }
                        Err(e) => {
                            retry_count += 1;
                            if retry_count >= max_retries {
                                error!(
                                    "Failed to get database connection after {max_retries} attempts. Last error: {e}"
                                );
                                std::process::exit(-1);
                            }
                            info!(
                                "Database connection attempt {retry_count}/{max_retries} failed, retrying in {backoff_duration:?}..."
                            );
                            std::thread::sleep(backoff_duration);
                            backoff_duration =
                                std::cmp::min(backoff_duration * 2, Duration::from_secs(10));
                        }
                    }
                }
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        error!(
                            "Failed to create database connection pool after {max_retries} attempts. Last error: {e}"
                        );
                        std::process::exit(-1);
                    }
                    info!(
                        "Database pool creation attempt {retry_count}/{max_retries} failed, retrying in {backoff_duration:?}..."
                    );
                    std::thread::sleep(backoff_duration);
                    backoff_duration = std::cmp::min(backoff_duration * 2, Duration::from_secs(10));
                }
            }
        }
    };

    // ensure the database is setup correctly
    let mut db_connection = db_connection_pool.get().unwrap_or_else(|e| {
        error!("Could not get a database connection from the connection pool. The error was: {e}");
        std::process::exit(-1);
    });
    if let Err(error) = run_migrations(&mut db_connection) {
        error!("Failed to run the database migrations. The error was: {error}");
        std::process::exit(-1);
    }
    info!("Database preparations finished");

    // rocket configuration figment
    let rocket_configuration_figment = RocketConfig::figment()
        .merge(("port", 5479))
        .merge(("address", std::net::Ipv4Addr::new(0, 0, 0, 0)))
        // the client IP is taken from the reverse proxy header, so its name is part of the
        // configuration to document the dependency on the proxy
        .merge(("ip_header", "X-Real-IP"))
        .merge((
            "shutdown",
            Shutdown {
                ctrlc: true,
                signals: {
                    let mut set = std::collections::HashSet::new();
                    set.insert(Sig::Term);
                    set
                },
                grace: 2,
                mercy: 3,
                force: true,
                __non_exhaustive: (),
            },
        ));

    // log the startup of the backend service
    log_action(
        &mut db_connection,
        None,
        Action::ServerStarted,
        Some(format!(
            "Service with the version {} (build with rustc {}) started (build on {} at {})",
            env!("VERGEN_GIT_DESCRIBE"),
            env!("VERGEN_RUSTC_SEMVER"),
            env!("VERGEN_BUILD_DATE"),
            DateTime::parse_from_rfc3339(env!("VERGEN_BUILD_TIMESTAMP"))
                .unwrap()
                .time()
                .format("%H:%M:%S"),
        )),
    );

    // the connection was only held for the migrations and the startup audit log entry, so
    // return it to the pool instead of blocking one of its connections for the whole uptime
    drop(db_connection);

    // spawn background task for rate limiter cleanup
    rocket::tokio::spawn(async {
        use adventskalender_backend::rate_limiter::{RateLimitConfig, cleanup_old_entries};
        use log::debug;

        let config = RateLimitConfig::default();
        loop {
            rocket::tokio::time::sleep(std::time::Duration::from_secs(300)).await; // 5 minutes
            debug!("Running rate limiter cleanup task");
            cleanup_old_entries(&config);
        }
    });

    // mount all supported routes and launch the rocket :)
    info!("Database preparations done and starting up the API endpoints now...");
    if let Err(error) = build_rocket(
        rocket_configuration_figment,
        backend_config,
        AdventskalenderDatabaseConnection::from(db_connection_pool.clone()),
        cors_header,
    )
    .launch()
    .await
    {
        error!("Could not launch the backend web server. The error was: {error}");
        std::process::exit(-1);
    }

    // log the shutdown of the backend service, using a fresh connection from the pool since
    // the one used during startup was already returned to the pool
    match db_connection_pool.get() {
        Ok(mut db_connection) => {
            log_action(&mut db_connection, None, Action::ServerTerminated, None);
        }
        Err(error) => {
            error!("Could not log the shutdown of the backend service. The error was: {error}")
        }
    }
}

/// The error variants of a failed healthcheck, the subcommand exits with the code 1 for all of
/// them and only the message differs.
#[derive(Debug)]
enum HealthcheckError {
    /// The backend answered, but reported itself as unhealthy.
    Unhealthy,
    /// The backend answered with a status code which is not a plain success.
    RequestFailed { status: String },
    /// The backend could not be reached at all.
    ConnectionFailed { reason: String },
}

/// Perform a single healthcheck request against the health endpoint of the backend over plain
/// HTTP. The implementation uses only the standard library, which keeps the subcommand free of
/// any additional shared library the distroless container would have to ship.
fn healthcheck(host: &str, port: &str, path: &str) -> Result<(), HealthcheckError> {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    // parse the port up front so an invalid configuration surfaces as a connection failure
    let port: u16 = port
        .parse()
        .map_err(|error| HealthcheckError::ConnectionFailed {
            reason: format!("invalid port: {error}"),
        })?;

    // resolve the address and connect with a timeout so a hanging backend counts as unreachable
    let address = (host, port)
        .to_socket_addrs()
        .map_err(|error| HealthcheckError::ConnectionFailed {
            reason: error.to_string(),
        })?
        .next()
        .ok_or(HealthcheckError::ConnectionFailed {
            reason: "the address could not be resolved".to_string(),
        })?;
    let mut stream =
        TcpStream::connect_timeout(&address, Duration::from_secs(2)).map_err(|error| {
            HealthcheckError::ConnectionFailed {
                reason: error.to_string(),
            }
        })?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| HealthcheckError::ConnectionFailed {
            reason: error.to_string(),
        })?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| HealthcheckError::ConnectionFailed {
            reason: error.to_string(),
        })?;

    // send a minimal HTTP/1.1 request, using the same user agent as the former curl healthcheck
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: docker-health-check/1.0\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| HealthcheckError::ConnectionFailed {
            reason: error.to_string(),
        })?;

    // read until the end of the response head so the status line cannot end up split across
    // two reads, the body is of no interest
    let mut response = Vec::new();
    let mut buffer = [0u8; 1024];
    loop {
        let bytes =
            stream
                .read(&mut buffer)
                .map_err(|error| HealthcheckError::ConnectionFailed {
                    reason: error.to_string(),
                })?;
        if bytes == 0 {
            return Err(HealthcheckError::ConnectionFailed {
                reason: "the backend closed the connection before answering".to_string(),
            });
        }
        response.extend_from_slice(&buffer[..bytes]);
        if contains_end_of_headers(&response) {
            break;
        }
    }
    let response = String::from_utf8_lossy(&response);
    let status_line = response.lines().next().unwrap_or_default().to_string();

    // parse the numeric status code of the response line, only 200 counts as healthy
    let status_code = status_line
        .split(' ')
        .nth(1)
        .unwrap_or_default()
        .to_string();
    match status_code.as_str() {
        "200" => Ok(()),
        "503" => Err(HealthcheckError::Unhealthy),
        _ => Err(HealthcheckError::RequestFailed {
            status: status_line,
        }),
    }
}

/// Check whether the buffered response contains the empty line which ends the HTTP headers.
fn contains_end_of_headers(response: &[u8]) -> bool {
    response.windows(4).any(|window| window == b"\r\n\r\n")
}
#[cfg(test)]
mod settings_tests {
    use super::{DEFAULT_KEY_FILE_PATH, parse_settings};
    use std::collections::{HashMap, HashSet};
    use std::path::PathBuf;

    const REQUIRED_VARIABLES: [&str; 5] = [
        "ADVENTSKALENDER_API_HOST",
        "ADVENTSKALENDER_DB_CONNECTION",
        "ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT",
        "ADVENTSKALENDER_TOKEN_AUDIENCE",
        "ADVENTSKALENDER_CORS_ORIGINS",
    ];

    fn minimal_environment() -> HashMap<&'static str, String> {
        HashMap::from([
            (
                "ADVENTSKALENDER_API_HOST",
                "https://example.com".to_string(),
            ),
            (
                "ADVENTSKALENDER_DB_CONNECTION",
                "postgres://user:password@database/adventskalender".to_string(),
            ),
            (
                "ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT",
                "00000000-0000-0000-0000-000000000000".to_string(),
            ),
            (
                "ADVENTSKALENDER_TOKEN_AUDIENCE",
                "https://example.com,https://admin.example.com".to_string(),
            ),
            (
                "ADVENTSKALENDER_CORS_ORIGINS",
                "https://example.com".to_string(),
            ),
        ])
    }

    fn parse(environment: &HashMap<&'static str, String>) -> Result<super::Settings, String> {
        parse_settings(|name| environment.get(name).cloned())
    }

    fn with(name: &'static str, value: &str) -> HashMap<&'static str, String> {
        let mut environment = minimal_environment();
        environment.insert(name, value.to_string());
        environment
    }

    #[test]
    fn the_minimal_configuration_uses_the_defaults_of_the_optional_variables() {
        let settings = parse(&minimal_environment()).expect("a complete configuration");

        assert_eq!(settings.api_host, "https://example.com");
        assert_eq!(
            settings.jwks_uri,
            "https://example.com/.well-known/jwks.json"
        );
        assert_eq!(
            settings.database_connection_url,
            "postgres://user:password@database/adventskalender"
        );
        assert_eq!(
            settings.healthcheck_io_project,
            "00000000-0000-0000-0000-000000000000"
        );
        assert_eq!(
            settings.token_audience,
            HashSet::from([
                "https://example.com".to_string(),
                "https://admin.example.com".to_string()
            ])
        );
        assert_eq!(
            settings.cors_origins,
            vec!["https://example.com".to_string()]
        );
        assert_eq!(settings.key_file_path, PathBuf::from(DEFAULT_KEY_FILE_PATH));
        assert!(settings.cookie_secure, "the cookie is secure by default");
    }

    #[test]
    fn every_required_variable_which_is_unset_or_empty_is_an_error_naming_it() {
        for name in REQUIRED_VARIABLES {
            let mut environment = minimal_environment();
            environment.remove(name);
            let error = parse(&environment).expect_err(name);
            assert!(error.contains(name), "unset {name}: {error}");

            let error = parse(&with(name, "")).expect_err(name);
            assert!(error.contains(name), "empty {name}: {error}");
        }
    }

    #[test]
    fn a_cors_origin_list_without_any_origin_is_an_error() {
        let error = parse(&with("ADVENTSKALENDER_CORS_ORIGINS", " , ,")).unwrap_err();

        assert!(error.contains("ADVENTSKALENDER_CORS_ORIGINS"), "{error}");
    }

    #[test]
    fn the_cors_origins_are_trimmed_and_empty_entries_dropped() {
        let settings = parse(&with(
            "ADVENTSKALENDER_CORS_ORIGINS",
            " https://example.com , ,http://localhost:5173",
        ))
        .unwrap();

        assert_eq!(
            settings.cors_origins,
            vec![
                "https://example.com".to_string(),
                "http://localhost:5173".to_string()
            ]
        );
    }

    #[test]
    fn an_api_host_which_is_not_a_url_is_an_error() {
        let error = parse(&with("ADVENTSKALENDER_API_HOST", "example.com")).unwrap_err();

        assert!(error.contains("ADVENTSKALENDER_API_HOST"), "{error}");
    }

    #[test]
    fn the_cookie_secure_flag_accepts_true_and_false_in_any_case() {
        for (value, expected) in [
            ("true", true),
            ("TRUE", true),
            ("false", false),
            ("False", false),
        ] {
            let settings = parse(&with("ADVENTSKALENDER_COOKIE_SECURE", value)).unwrap();
            assert_eq!(settings.cookie_secure, expected, "value {value}");
        }
    }

    #[test]
    fn an_empty_cookie_secure_flag_keeps_the_secure_default() {
        let settings = parse(&with("ADVENTSKALENDER_COOKIE_SECURE", "")).unwrap();

        assert!(settings.cookie_secure);
    }

    #[test]
    fn any_other_cookie_secure_value_is_an_error() {
        for value in ["yes", "0", "1", "off", " true"] {
            let error = parse(&with("ADVENTSKALENDER_COOKIE_SECURE", value)).expect_err(value);
            assert!(error.contains("ADVENTSKALENDER_COOKIE_SECURE"), "{error}");
        }
    }

    #[test]
    fn the_key_file_path_can_be_overridden() {
        let settings = parse(&with("ADVENTSKALENDER_KEY_FILE_PATH", "/keys/signing.der")).unwrap();

        assert_eq!(settings.key_file_path, PathBuf::from("/keys/signing.der"));
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::{HealthcheckError, healthcheck};
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::thread;

    fn serve_responses(
        responses: Vec<String>,
    ) -> (String, String, thread::JoinHandle<Option<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let port = listener
            .local_addr()
            .expect("test listener address")
            .port()
            .to_string();
        let handler = thread::spawn(move || {
            let mut first_request_line = None;
            for response in responses {
                let (mut stream, _) = listener.accept().expect("test connection");
                let mut reader = BufReader::new(&mut stream);
                let mut request_line = String::new();
                reader.read_line(&mut request_line).expect("request line");
                if first_request_line.is_none() {
                    first_request_line = Some(request_line.trim_end().to_string());
                }
                loop {
                    let mut line = String::new();
                    let bytes = reader.read_line(&mut line).expect("header line");
                    if bytes == 0 || line == "\r\n" {
                        break;
                    }
                }
                stream
                    .write_all(response.as_bytes())
                    .expect("test response");
            }
            first_request_line
        });
        ("127.0.0.1".to_string(), port, handler)
    }

    #[test]
    fn the_healthcheck_succeeds_on_a_healthy_backend() {
        let (host, port, handler) = serve_responses(vec![
            "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".to_string(),
        ]);

        let result = healthcheck(&host, &port, "/v1/health");

        assert!(matches!(result, Ok(())));
        let request_line = handler.join().expect("test server thread");
        assert_eq!(request_line, Some("GET /v1/health HTTP/1.1".to_string()));
    }

    #[test]
    fn the_healthcheck_reports_the_backend_as_unhealthy_on_a_503_response() {
        let (host, port, handler) = serve_responses(vec![
            "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n".to_string(),
        ]);

        let result = healthcheck(&host, &port, "/v1/health");

        assert!(matches!(result, Err(HealthcheckError::Unhealthy)));
        handler.join().expect("test server thread");
    }

    #[test]
    fn the_healthcheck_reports_the_backend_as_unreachable_when_it_does_not_answer() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let host = "127.0.0.1".to_string();
        let port = listener
            .local_addr()
            .expect("test listener address")
            .port()
            .to_string();
        drop(listener);

        let result = healthcheck(&host, &port, "/v1/health");

        assert!(matches!(
            result,
            Err(HealthcheckError::ConnectionFailed { .. })
        ));
    }

    #[test]
    fn the_healthcheck_reports_other_failure_statuses_as_request_failures() {
        let (host, port, handler) = serve_responses(vec![
            "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n".to_string(),
        ]);

        let result = healthcheck(&host, &port, "/v1/health");

        assert!(matches!(
            result,
            Err(HealthcheckError::RequestFailed { .. })
        ));
        handler.join().expect("test server thread");
    }

    // the tests of the key file handling live in this module as well
    use super::load_or_generate_keypair;
    use ring::signature::Ed25519KeyPair;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static CREATED_KEY_DIRECTORIES: AtomicUsize = AtomicUsize::new(0);

    /// Creates an empty directory which no other test uses, so that every test can inspect all
    /// files it leaves behind.
    fn temporary_key_directory() -> std::path::PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "adventskalender-key-test-{}-{}",
            std::process::id(),
            CREATED_KEY_DIRECTORIES.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn mode_of(path: &std::path::Path) -> u32 {
        std::fs::metadata(path)
            .expect("key file metadata")
            .permissions()
            .mode()
    }

    fn file_names_in(directory: &std::path::Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_missing_key_file_is_generated_and_only_accessible_by_the_owner() {
        let key_directory = temporary_key_directory();
        let key_file_path = key_directory.join("key.der");

        let key_bytes = load_or_generate_keypair(&key_file_path).expect("key generation failed");

        assert!(Ed25519KeyPair::from_pkcs8(&key_bytes).is_ok());
        assert_eq!(std::fs::read(&key_file_path).unwrap(), key_bytes);
        assert_eq!(mode_of(&key_file_path) & 0o777, 0o600);
        assert_eq!(
            file_names_in(&key_directory),
            vec!["key.der".to_string()],
            "no temporary file may be left behind"
        );
        std::fs::remove_dir_all(&key_directory).unwrap();
    }

    #[test]
    fn a_missing_key_directory_is_created() {
        let key_directory = temporary_key_directory();
        let key_file_path = key_directory.join("nested").join("key.der");

        let key_bytes = load_or_generate_keypair(&key_file_path).expect("key generation failed");

        assert_eq!(std::fs::read(&key_file_path).unwrap(), key_bytes);
        std::fs::remove_dir_all(&key_directory).unwrap();
    }

    #[test]
    fn an_existing_valid_key_file_is_loaded_unchanged() {
        let key_directory = temporary_key_directory();
        let key_file_path = key_directory.join("key.der");
        let first_key = load_or_generate_keypair(&key_file_path).expect("key generation failed");

        let loaded_key = load_or_generate_keypair(&key_file_path).expect("key loading failed");

        assert_eq!(loaded_key, first_key);
        assert_eq!(std::fs::read(&key_file_path).unwrap(), first_key);
        std::fs::remove_dir_all(&key_directory).unwrap();
    }

    #[test]
    fn an_existing_invalid_key_file_is_an_error_and_stays_untouched() {
        let key_directory = temporary_key_directory();
        let key_file_path = key_directory.join("key.der");
        std::fs::write(&key_file_path, "-----BEGIN PRIVATE KEY-----").unwrap();

        let result = load_or_generate_keypair(&key_file_path);

        let error = result.expect_err("an invalid key file must not be replaced");
        assert!(
            error.contains("key.der"),
            "the error must name the key file, got: {error}"
        );
        assert_eq!(
            std::fs::read(&key_file_path).unwrap(),
            b"-----BEGIN PRIVATE KEY-----"
        );
        assert_eq!(file_names_in(&key_directory), vec!["key.der".to_string()]);
        std::fs::remove_dir_all(&key_directory).unwrap();
    }

    #[test]
    fn an_existing_unreadable_key_file_is_an_error_and_stays_untouched() {
        let key_directory = temporary_key_directory();
        let key_file_path = key_directory.join("key.der");
        std::fs::write(&key_file_path, "secret").unwrap();
        std::fs::set_permissions(&key_file_path, std::fs::Permissions::from_mode(0o200)).unwrap();

        let result = load_or_generate_keypair(&key_file_path);

        std::fs::set_permissions(&key_file_path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let error = result.expect_err("an unreadable key file must not be replaced");
        assert!(
            error.contains("Permission denied"),
            "the error must name the real reason, got: {error}"
        );
        assert_eq!(std::fs::read(&key_file_path).unwrap(), b"secret");
        std::fs::remove_dir_all(&key_directory).unwrap();
    }

    #[test]
    fn a_leftover_temporary_file_of_an_interrupted_write_does_not_block_the_generation() {
        let key_directory = temporary_key_directory();
        let key_file_path = key_directory.join("key.der");
        let leftover_path = key_directory.join(".key.der.tmp");
        std::fs::write(&leftover_path, "partial").unwrap();
        std::fs::set_permissions(&leftover_path, std::fs::Permissions::from_mode(0o644)).unwrap();

        let key_bytes = load_or_generate_keypair(&key_file_path).expect("key generation failed");

        assert_eq!(std::fs::read(&key_file_path).unwrap(), key_bytes);
        assert_eq!(mode_of(&key_file_path) & 0o777, 0o600);
        assert_eq!(file_names_in(&key_directory), vec!["key.der".to_string()]);
        std::fs::remove_dir_all(&key_directory).unwrap();
    }

    #[test]
    fn an_unwritable_key_directory_is_reported_as_an_error() {
        let key_directory = temporary_key_directory();
        std::fs::set_permissions(&key_directory, std::fs::Permissions::from_mode(0o555)).unwrap();

        let result = load_or_generate_keypair(&key_directory.join("key.der"));

        std::fs::set_permissions(&key_directory, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::remove_dir_all(&key_directory).unwrap();

        let error = result.expect_err("writing a key into an unwritable directory must fail");
        assert!(
            error.contains("Permission denied"),
            "the error must name the real reason instead of masking it, got: {error}"
        );
    }
}
