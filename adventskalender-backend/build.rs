use vergen::{BuildBuilder, CargoBuilder, Emitter, RustcBuilder};
use vergen_git2::Git2Builder;

fn main() {
    // set up the configuration for vergen
    //let mut config = Config::default();
    //*config.build_mut().kind_mut() = TimestampKind::DateAndTime;
    //*config.build_mut().timezone_mut() = TimeZone::Utc;

    let build = BuildBuilder::all_build().expect("Failed to build info emitter");
    let cargo = CargoBuilder::all_cargo().expect("Failed to build cargo vergen emitter");
    let git2 = Git2Builder::all_git().expect("Failed to build git vergen emitter");
    let rustc = RustcBuilder::all_rustc().expect("Failed to build rustc vergen emitter");

    // configure vergen to generate the required environment variables
    if let Err(error) = Emitter::default()
        .add_instructions(&build)
        .expect("Failed to create emit emitter for: build")
        .add_instructions(&cargo)
        .expect("Failed to create emit emitter for: cargo")
        .add_instructions(&git2)
        .expect("Failed to create emit emitter for: git")
        .add_instructions(&rustc)
        .expect("Failed to create emit emitter for: rustc")
        .fail_on_error()
        .emit()
    {
        panic!(
            "Could not extract the required version information. The error was: {}",
            error
        );
    }
}
