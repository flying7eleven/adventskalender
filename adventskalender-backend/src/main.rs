use diesel::PgConnection;

#[cfg(debug_assertions)]
#[macro_use]
extern crate diesel_migrations;

#[cfg(debug_assertions)]
embed_migrations!("migrations/");

#[cfg(debug_assertions)]
pub fn run_migrations(connection: &PgConnection) {
    use log::debug;
    match embedded_migrations::run(connection) {
        Ok(_) => debug!("Successfully ran the database migrations"),
        Err(_) => panic!("Failed to run the database migrations, terminating..."),
    }
}

#[cfg(not(debug_assertions))]
pub fn run_migrations(_: &PgConnection) {
    use log::debug;
    debug!("Not running any migration since we are in a production build");
}

fn setup_logging(verbosity_level: i32) {
    use chrono::Utc;
    use log::LevelFilter;

    // create an instance for the Dispatcher to create a new logging configuration
    let mut base_config = fern::Dispatch::new();

    // determine the logging level based on the verbosity the user chose
    base_config = match verbosity_level {
        0 => base_config.level(LevelFilter::Warn),
        1 => base_config.level(LevelFilter::Info),
        2 => base_config.level(LevelFilter::Debug),
        _3_or_more => base_config.level(LevelFilter::Trace),
    };

    // define how a logging line in the logfile as well as the console should look like
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
        .chain(fern::log_file("adventskalender.log").unwrap())
        .chain(std::io::stdout());

    // now chain everything together and get ready for actually logging stuff
    base_config
        .chain(file_config)
        .level_for("reqwest", LevelFilter::Off)
        .level_for("want", LevelFilter::Off)
        .level_for("mio", LevelFilter::Off)
        .apply()
        .unwrap();
}

fn main() {
    use diesel::Connection;
    use log::{debug, error, info};
    use std::env;

    // setup the logging of the application based on if we are in debug or release mode
    #[cfg(debug_assertions)]
    setup_logging(3);
    #[cfg(not(debug_assertions))]
    setup_logging(1);

    // just inform the user that we are starting up
    info!(
        "Starting adventskalender backend ({})...",
        env!("VERGEN_GIT_SEMVER")
    );

    // get the configuration for the database server and terminate if something is missing
    let database_connection_url =
        env::var("ADVENTSKALENDER_DB_CONNECTION").unwrap_or("".to_string());
    if database_connection_url.is_empty() {
        error!("Could not get the configuration for the database server. Ensure ADVENTSKALENDER_DB_CONNECTION is set properly");
        return;
    }

    // get a connection to the database server
    let maybe_database_connection = PgConnection::establish(&database_connection_url);
    if maybe_database_connection.is_err() {
        error!(
            "Could not connect to the database server with the supplied URL. The error was: {}",
            maybe_database_connection.err().unwrap()
        );
        return;
    }
    let database_connection = maybe_database_connection.unwrap();
    debug!("Successfully connected to the database server");

    // ensure the database is setup correctly
    run_migrations(&database_connection);
}
