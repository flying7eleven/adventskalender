use vergen::EmitBuilder;

fn main() {
    // set up the configuration for vergen
    //let mut config = Config::default();
    //*config.build_mut().kind_mut() = TimestampKind::DateAndTime;
    //*config.build_mut().timezone_mut() = TimeZone::Utc;

    // configure vergen to generate the required environment variables
    if let Err(error) = EmitBuilder::builder()
        .fail_on_error()
        .all_build()
        .all_cargo()
        .all_rustc()
        .git_describe(false, true, None)
        .emit()
    {
        panic!(
            "Could not extract the required version information. The error was: {}",
            error
        );
    }
}
