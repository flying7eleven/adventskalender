use adventskalender_backend::rocket_cors::AllowedOrigins;
use adventskalender_backend::routes::{
    get_login_token_options, get_number_of_participants_who_already_won_options,
    participants_won_options,
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

    // define how a logging line should look like and attach the streams to which the output will be
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

#[rocket::main]
async fn main() {
    use adventskalender_backend::fairings::{
        AdventskalenderDatabaseConnection, BackendConfiguration,
    };
    use adventskalender_backend::routes::{
        check_backend_health, count_won_participants_on_day, get_all_won_participants,
        get_audit_event_count, get_backend_version, get_login_token,
        get_number_of_participants_who_already_won, get_won_participants_on_day_route,
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

    // get the issuer for the tokens
    let token_issuer = env::var("ADVENTSKALENDER_TOKEN_ISSUER").unwrap_or("".to_string());
    if token_issuer.is_empty() {
        error!("Could not get the token signature PSK. Ensure ADVENTSKALENDER_TOKEN_ISSUER is set properly");
        return;
    }

    // get the audience for the token
    let token_audience_str = env::var("ADVENTSKALENDER_TOKEN_AUDIENCE").unwrap_or("".to_string());
    if token_issuer.is_empty() {
        error!("Could not get the token signature PSK. Ensure ADVENTSKALENDER_TOKEN_AUDIENCE is set properly");
        return;
    }
    let token_audience_hash_set = token_audience_str
        .split(',')
        .map(|s| s.to_string())
        .collect::<HashSet<String>>();

    // on server startup generate a new Ed25519 key pair for signing the token; this will automatically invalidate
    // all previously signed token on server restart
    let ed25519_key_pair = match Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new()) {
        Ok(key_pair) => key_pair,
        Err(error) => {
            error!(
                "Failed to generate Ed25519 key pair. The error was: {}",
                error
            );
            return;
        }
    };
    let decoding_key = DecodingKey::from_ed_der(ed25519_key_pair.as_ref());
    let encoding_key = EncodingKey::from_ed_der(ed25519_key_pair.as_ref());

    let backend_config = BackendConfiguration {
        encoding_key: Some(encoding_key),
        decoding_key: Some(decoding_key),
        token_audience: token_audience_hash_set,
        token_issuer: token_issuer.to_string(),
        healthcheck_project: healthcheck_io_project.to_string(),
    };

    // just wait for 10 seconds until we continue. This is just an ugly fix that we have to wait until the database server
    // has spun up
    #[cfg(not(debug_assertions))]
    {
        info!("Waiting for 10 seconds to ensure that the database had enough time to spin up...");
        std::thread::sleep(std::time::Duration::from_secs(10));
    }

    // create a db connection pool manager and the corresponding pool
    let db_connection_pool_manager =
        diesel::r2d2::ConnectionManager::new(database_connection_url.clone());
    let db_connection_pool = r2d2::Pool::builder()
        .max_size(15)
        .connection_timeout(Duration::from_secs(5))
        .build(db_connection_pool_manager)
        .unwrap();
    debug!("Successfully connected to the database server");

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
    let allowed_origins = AllowedOrigins::All;
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

    // after everything is set up, we should unset ann environment variables to prevent leaking
    // sensitive information
    unset_environment_variable("ADVENTSKALENDER_LOGGING_LEVEL");
    unset_environment_variable("ADVENTSKALENDER_DB_CONNECTION");
    unset_environment_variable("ADVENTSKALENDER_TOKEN_SIGNATURE_PSK");

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

    // mount all supported routes and launch the rocket :)
    info!("Database preparations done and starting up the API endpoints now...");
    let _ = rocket::custom(rocket_configuration_figment)
        .attach(cors_header)
        .manage(backend_config)
        .manage(AdventskalenderDatabaseConnection::from(db_connection_pool))
        .mount(
            "/v1",
            routes![
                get_login_token,
                get_login_token_options,
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
