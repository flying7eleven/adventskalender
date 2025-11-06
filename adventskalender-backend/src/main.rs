use adventskalender_backend::rocket_cors::AllowedOrigins;
use adventskalender_backend::routes::{
    get_login_token_options, get_number_of_participants_who_already_won_options,
    get_openid_configuration, participants_won_options,
};
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

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");

pub fn run_migrations(connection: &mut PgConnection) {
    use diesel_migrations::MigrationHarness;
    use log::{error, info};
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
        }
        Err(error) => {
            error!(
                "Failed to run the database migrations. The error was: {}",
                error
            )
        }
    }
}

fn unset_environment_variable(name: &str) {
    use std::env::remove_var;
    remove_var(name)
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
        info!("Loading existing Ed25519 key pair from {:?}", key_file_path);
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
                            "Existing key file is invalid or corrupted: {}. Generating new key.",
                            e
                        );
                    }
                }
            }
            Err(e) => {
                warn!(
                    "Failed to read existing key file: {}. Generating new key.",
                    e
                );
            }
        }
    }

    // generate a new key
    info!(
        "Generating new Ed25519 key pair and saving to {:?}",
        key_file_path
    );
    let key_pair_doc = match Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new()) {
        Ok(doc) => doc,
        Err(e) => return Err(format!("Failed to generate Ed25519 key pair: {}", e)),
    };

    // create a parent directory if it doesn't exist
    if let Some(parent) = key_file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create key directory: {}", e))?;
        }
    }

    // write key to file
    let mut file =
        fs::File::create(key_file_path).map_err(|e| format!("Failed to create key file: {}", e))?;
    file.write_all(key_pair_doc.as_ref())
        .map_err(|e| format!("Failed to write key to file: {}", e))?;

    // set file permissions to 0600 (read/write for the owner only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = file
            .metadata()
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(key_file_path, perms)
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
        info!("Set key file permissions to 0600");
    }

    info!("Successfully generated and saved new Ed25519 key pair");
    Ok(key_pair_doc.as_ref().to_vec())
}

#[rocket::main]
async fn main() {
    use adventskalender_backend::fairings::{
        AdventskalenderDatabaseConnection, BackendConfiguration, SecurityHeaders,
    };
    use adventskalender_backend::routes::{
        check_backend_health, count_won_participants_on_day, get_all_won_participants,
        get_audit_event_count, get_backend_version, get_login_token,
        get_number_of_participants_who_already_won, get_won_participants_on_day_route, logout,
        pick_multiple_random_participant_from_raffle_list, remove_participant_from_winner_list,
        update_participant_values, update_user_password,
    };
    use log::{debug, error, info};
    use rocket::figment::{
        util::map,
        value::{Map, Value},
    };
    use rocket::http::Method;
    use rocket::routes;
    use rocket::Config as RocketConfig;
    use std::env;

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

    // get the API base host
    let api_host = env::var("ADVENTSKALENDER_API_HOST").unwrap_or("".to_string());
    if api_host.is_empty() {
        error!("Could not get the token signature PSK. Ensure ADVENTSKALENDER_API_HOST is set properly");
        return;
    }

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
        error!("Could not get the token signature PSK. Ensure ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT is set properly");
        return;
    }

    // get the audience for the token
    let token_audience_str = env::var("ADVENTSKALENDER_TOKEN_AUDIENCE").unwrap_or("".to_string());
    if token_audience_str.is_empty() {
        error!("Could not get the token signature PSK. Ensure ADVENTSKALENDER_TOKEN_AUDIENCE is set properly");
        return;
    }
    let token_audience_hash_set = token_audience_str
        .split(',')
        .map(|s| s.to_string())
        .collect::<HashSet<String>>();

    // get the allowed CORS origins (comma-separated list)
    let allowed_cors_origins =
        env::var("ADVENTSKALENDER_CORS_ORIGINS").unwrap_or("http://localhost:5173".to_string());
    info!("Allowed CORS origins: {}", allowed_cors_origins);

    // get the key file path for Ed25519 key persistence
    let key_file_path_str = env::var("ADVENTSKALENDER_KEY_FILE_PATH")
        .unwrap_or_else(|_| "/data/adventskalender_ed25519.key".to_string());
    let key_file_path = std::path::Path::new(&key_file_path_str);

    // load or generate Ed25519 key pair for signing tokens (persisted across restarts)
    let ed25519_key_bytes = match load_or_generate_keypair(key_file_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            error!("Failed to load or generate Ed25519 key pair: {}", error);
            return;
        }
    };

    // create encoding/decoding keys from the key bytes
    let decoding_key = DecodingKey::from_ed_der(&ed25519_key_bytes);
    let encoding_key = EncodingKey::from_ed_der(&ed25519_key_bytes);

    let backend_config = BackendConfiguration {
        api_host,
        encoding_key: Some(encoding_key),
        decoding_key: Some(decoding_key),
        token_audience: token_audience_hash_set,
        healthcheck_project: healthcheck_io_project.to_string(),
    };

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
                                    "Failed to get database connection after {} attempts. Last error: {}",
                                    max_retries, e
                                );
                                std::process::exit(-1);
                            }
                            info!(
                                "Database connection attempt {}/{} failed, retrying in {:?}...",
                                retry_count, max_retries, backoff_duration
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
                            "Failed to create database connection pool after {} attempts. Last error: {}",
                            max_retries, e
                        );
                        std::process::exit(-1);
                    }
                    info!(
                        "Database pool creation attempt {}/{} failed, retrying in {:?}...",
                        retry_count, max_retries, backoff_duration
                    );
                    std::thread::sleep(backoff_duration);
                    backoff_duration = std::cmp::min(backoff_duration * 2, Duration::from_secs(10));
                }
            }
        }
    };

    // ensure the database is setup correctly
    let mut db_connection = db_connection_pool.get().unwrap_or_else(|e| {
        error!(
            "Could not get a database connection from the connection pool. The error was: {}",
            e
        );
        std::process::exit(-1);
    });
    run_migrations(&mut db_connection);
    info!("Database preparations finished");

    // configure the database pool based on the supplied connection URL
    let adventskalender_database_config: Map<_, Value> = map! {
        "url" => database_connection_url.into(),
        "pool_size" => 25.into()
    };

    // rocket configuration figment
    let rocket_configuration_figment = RocketConfig::figment()
        .merge((
            "databases",
            map!["adventskalender" => adventskalender_database_config],
        ))
        .merge(("port", 5479))
        .merge(("address", std::net::Ipv4Addr::new(0, 0, 0, 0)))
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
    let origins_refs: Vec<&str> = origins_list.iter().map(|s| s.as_str()).collect();
    let allowed_origins = AllowedOrigins::some_exact(&origins_refs);
    let cors_header = adventskalender_backend::rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get, Method::Post, Method::Put, Method::Delete]
            .into_iter()
            .map(From::from)
            .collect(),
        allowed_headers: adventskalender_backend::rocket_cors::AllowedHeaders::All,
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors()
    .unwrap();

    // after everything is set up, we should unset all environment variables to prevent leaking
    // sensitive information through process memory inspection or core dumps
    debug!("Clearing sensitive environment variables from memory");
    unset_environment_variable("ADVENTSKALENDER_LOGGING_LEVEL");
    unset_environment_variable("ADVENTSKALENDER_DB_CONNECTION");
    unset_environment_variable("ADVENTSKALENDER_API_HOST");
    unset_environment_variable("ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT");
    unset_environment_variable("ADVENTSKALENDER_TOKEN_AUDIENCE");
    unset_environment_variable("ADVENTSKALENDER_CORS_ORIGINS");
    unset_environment_variable("ADVENTSKALENDER_KEY_FILE_PATH");
    debug!("Environment variable cleanup completed");

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
    let _ = rocket::custom(rocket_configuration_figment)
        .attach(cors_header)
        .attach(SecurityHeaders)
        .manage(backend_config)
        .manage(AdventskalenderDatabaseConnection::from(db_connection_pool))
        .mount("/.well-known", routes![get_openid_configuration])
        .mount(
            "/v1",
            routes![
                get_login_token,
                get_login_token_options,
                logout,
                get_number_of_participants_who_already_won,
                get_number_of_participants_who_already_won_options,
                pick_multiple_random_participant_from_raffle_list,
                participants_won_options,
                get_all_won_participants,
                count_won_participants_on_day,
                update_participant_values,
                remove_participant_from_winner_list,
                check_backend_health,
                get_backend_version,
                update_user_password,
                get_audit_event_count,
                get_won_participants_on_day_route,
            ],
        )
        .launch()
        .await;

    // log the shutdown of the backend service
    log_action(&mut db_connection, None, Action::ServerTerminated, None);
}
