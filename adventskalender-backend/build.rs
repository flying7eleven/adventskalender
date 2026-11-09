use vergen::Emitter;
use vergen_git2::Git2;

fn main() {
    let build = vergen::Build::all_build();
    let cargo = vergen::Cargo::all_cargo();
    let git2 = Git2::all_git();
    let rustc = vergen::Rustc::all_rustc();

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
        panic!("Could not extract the required version information. The error was: {error}");
    }
}
