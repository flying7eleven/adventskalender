use vergen::{vergen, Config};

fn main() {
    if let Err(error) = vergen(Config::default()) {
        panic!(
            "Could not extract the required version information. The error was: {}",
            error
        );
    }
}
