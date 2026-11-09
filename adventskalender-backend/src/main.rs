use adventskalender_backend::fairings::BackendConfiguration;
use adventskalender_backend::routes::mount_routes;
use adventskalender_backend::{log_action, Action};
use chrono::DateTime;
use diesel::PgConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations};
use jsonwebtoken::{DecodingKey, EncodingKey};
use log::LevelFilter;
use ring::signature::Ed25519KeyPair;
use rocket::config::{Shutdown, Sig};
use std::collections::HashSet;
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

/// Load Ed25519 key pair from a file, or generate and save a new one if it doesn't exist
fn load_or_generate_keypair(key_file_path: &std::path::Path) -> Result<Vec<u8>, String> {
    use log::{info, warn};
    use std::fs;
    use std::io::Write;

    // Try to load the existing key
    if key_file_path.exists() {
        info!("Loading existing Ed25519 key pair from {key_file_path:?}");
        match fs::read(key_file_path) {
            Ok(key_bytes) => {
                // Validate the key can be parsed
                match Ed25519KeyPair::from_pkcs8(&key_bytes) {
                    Ok(_) => {
                        info!("Successfully loaded existing Ed25519 key pair");
                        return Ok(key_bytes);
                    }
                    Err(e) => {
                        warn!(
                            "Existing key file is invalid or corrupted: {e}. Generating new key."
                        );
                    }
                }
            }
            Err(e) => {
                warn!("Failed to read existing key file: {e}. Generating new key.");
            }
        }
    }

    // generate a new key
    info!("Generating new Ed25519 key pair and saving to {key_file_path:?}");
    let key_pair_doc = match Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new()) {
        Ok(doc) => doc,
        Err(e) => return Err(format!("Failed to generate Ed25519 key pair: {e}")),
    };

    // create a parent directory if it doesn't exist
    if let Some(parent) = key_file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create key directory: {e}"))?;
        }
    }

    // write the key to a file which only the owner can read and write, right from its creation,
    // so that the private key is never visible to other users even for a short time. The mode of
    // a newly created file only applies on creation, so the permissions of a replaced existing
    // file are explicitly set again before anything is written to it.
    #[cfg(unix)]
    let open_key_file = {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        |path: &std::path::Path| -> std::io::Result<std::fs::File> {
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(path)
                .or_else(|error| {
                    if error.kind() != std::io::ErrorKind::AlreadyExists {
                        return Err(error);
                    }
                    let file = std::fs::OpenOptions::new()
                        .write(true)
                        .truncate(true)
                        .open(path)?;
                    file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
                    Ok(file)
                })
        }
    };
    #[cfg(not(unix))]
    let open_key_file = |path: &std::path::Path| std::fs::File::create(path);

    let mut file =
        open_key_file(key_file_path).map_err(|e| format!("Failed to create key file: {e}"))?;
    file.write_all(key_pair_doc.as_ref())
        .map_err(|e| format!("Failed to write key to file: {e}"))?;

    info!("Successfully generated and saved new Ed25519 key pair");
    Ok(key_pair_doc.as_ref().to_vec())
}

#[rocket::main]
async fn main() {
    use adventskalender_backend::fairings::{AdventskalenderDatabaseConnection, SecurityHeaders};
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

    // get the API base host and ensure it is a valid URL since it is used to build the
    // advertised OpenID configuration
    let api_host = env::var("ADVENTSKALENDER_API_HOST").unwrap_or("".to_string());
    if api_host.is_empty() {
        error!("Could not get the API host. Ensure ADVENTSKALENDER_API_HOST is set properly");
        return;
    }
    let api_host_url = match Url::parse(&api_host) {
        Ok(url) => url,
        Err(error) => {
            error!("The supplied API host '{api_host}' is not a valid URL. The error was: {error}");
            return;
        }
    };
    let jwks_uri = match api_host_url.join("/.well-known/jwks.json") {
        Ok(url) => url.to_string(),
        Err(error) => {
            error!("Could not build the JWKS URL from the API host '{api_host}'. The error was: {error}");
            return;
        }
    };

    // get the configuration for the database server and terminate if something is missing
    let database_connection_url =
        env::var("ADVENTSKALENDER_DB_CONNECTION").unwrap_or("".to_string());
    if database_connection_url.is_empty() {
        error!("Could not get the configuration for the database server. Ensure ADVENTSKALENDER_DB_CONNECTION is set properly");
        return;
    }

    // get the project UUID for the health check
    let healthcheck_io_project =
        env::var("ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT").unwrap_or("".to_string());
    if healthcheck_io_project.is_empty() {
        error!("Could not get the healthchecks.io project UUID. Ensure ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT is set properly");
        return;
    }

    // get the audience for the token
    let token_audience_str = env::var("ADVENTSKALENDER_TOKEN_AUDIENCE").unwrap_or("".to_string());
    if token_audience_str.is_empty() {
        error!("Could not get the token audience. Ensure ADVENTSKALENDER_TOKEN_AUDIENCE is set properly");
        return;
    }
    let token_audience_hash_set = token_audience_str
        .split(',')
        .map(|s| s.to_string())
        .collect::<HashSet<String>>();

    // get the allowed CORS origins (comma-separated list)
    let allowed_cors_origins =
        env::var("ADVENTSKALENDER_CORS_ORIGINS").unwrap_or("http://localhost:5173".to_string());
    info!("Allowed CORS origins: {allowed_cors_origins}");

    // get the key file path for Ed25519 key persistence
    let key_file_path_str = env::var("ADVENTSKALENDER_KEY_FILE_PATH")
        .unwrap_or_else(|_| "/data/adventskalender_ed25519.key".to_string());
    let key_file_path = std::path::Path::new(&key_file_path_str);

    // load or generate Ed25519 key pair for signing tokens (persisted across restarts)
    let ed25519_key_bytes = match load_or_generate_keypair(key_file_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            error!("Failed to load or generate Ed25519 key pair: {error}");
            return;
        }
    };

    // create encoding/decoding keys from the key bytes
    // For Ed25519: encoding needs the full keypair, decoding needs only the public key
    let encoding_key = EncodingKey::from_ed_der(&ed25519_key_bytes);

    // Extract public key from the keypair for decoding
    use ring::signature::KeyPair; // Import trait for public_key() method
    let public_key_bytes = match Ed25519KeyPair::from_pkcs8(&ed25519_key_bytes) {
        Ok(keypair) => keypair.public_key().as_ref().to_vec(),
        Err(e) => {
            error!("Failed to extract public key from Ed25519 keypair: {e}");
            return;
        }
    };
    let decoding_key = DecodingKey::from_ed_der(&public_key_bytes);

    let backend_config = BackendConfiguration::new(
        api_host,
        jwks_uri,
        encoding_key,
        decoding_key,
        ed25519_key_bytes.clone(),
        healthcheck_io_project.to_string(),
        token_audience_hash_set,
    );

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

    // prepare the fairing for the CORS headers
    let origins_list: Vec<String> = allowed_cors_origins
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let cors_header = adventskalender_backend::cors_fairing(origins_list).unwrap_or_else(|error| {
        error!("Could not build the CORS fairing. The error was: {error}");
        std::process::exit(-1);
    });

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
        use adventskalender_backend::rate_limiter::{cleanup_old_entries, RateLimitConfig};
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
    if let Err(error) = mount_routes(
        rocket::custom(rocket_configuration_figment)
            .attach(cors_header)
            .attach(SecurityHeaders)
            .manage(backend_config)
            .manage(AdventskalenderDatabaseConnection::from(
                db_connection_pool.clone(),
            )),
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
#[cfg(all(test, unix))]
mod tests {
    use super::{healthcheck, HealthcheckError};
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
    use std::os::unix::fs::PermissionsExt;

    fn temporary_key_file_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "adventskalender-key-permission-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn mode_of(path: &std::path::Path) -> u32 {
        std::fs::metadata(path)
            .expect("key file metadata")
            .permissions()
            .mode()
    }

    #[test]
    fn a_newly_generated_key_file_is_only_accessible_by_the_owner() {
        let key_file_path = temporary_key_file_path();
        let _ = std::fs::remove_file(&key_file_path);

        let key_bytes = load_or_generate_keypair(&key_file_path).expect("key generation failed");
        assert!(!key_bytes.is_empty());

        assert_eq!(mode_of(&key_file_path) & 0o777, 0o600);

        std::fs::remove_file(&key_file_path).unwrap();
    }

    #[test]
    fn a_regenerated_key_file_over_an_existing_invalid_one_is_only_accessible_by_the_owner() {
        let key_file_path = temporary_key_file_path();
        std::fs::write(&key_file_path, "this is not a valid PKCS8 key").unwrap();
        std::fs::set_permissions(&key_file_path, std::fs::Permissions::from_mode(0o644)).unwrap();

        let key_bytes = load_or_generate_keypair(&key_file_path).expect("key generation failed");
        assert!(!key_bytes.is_empty());

        assert_eq!(mode_of(&key_file_path) & 0o777, 0o600);

        std::fs::remove_file(&key_file_path).unwrap();
    }

    #[test]
    fn an_unwritable_key_directory_is_reported_as_an_error() {
        let key_directory = std::env::temp_dir().join(format!(
            "adventskalender-key-dir-permission-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&key_directory).unwrap();
        std::fs::set_permissions(&key_directory, std::fs::Permissions::from_mode(0o555)).unwrap();

        let result = load_or_generate_keypair(&key_directory.join("key.pem"));

        std::fs::set_permissions(&key_directory, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::remove_dir_all(&key_directory).unwrap();

        let error = result.expect_err("writing a key into an unwritable directory must fail");
        assert!(
            error.contains("Permission denied"),
            "the error must name the real reason instead of masking it, got: {error}"
        );
    }
}
