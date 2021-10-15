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
    use log::info;

    // setup the logging of the application based on if we are in debug or release mode
    #[cfg(debug_assertions)]
    setup_logging(3);
    #[cfg(not(debug_assertions))]
    setup_logging(1);

    // just inform the user that we are starting up
    info!("Starting adventskalender backend...")
}
