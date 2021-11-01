#[macro_use]
extern crate diesel;
#[macro_use]
extern crate diesel_migrations;

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

pub mod fairings;
pub mod models;
pub mod routes;
mod schema;

lazy_static! {
    /// The time in seconds a token is valid.
    static ref TOKEN_LIFETIME_IN_SECONDS: usize = 60 * 60;
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    exp: usize,
    iat: usize,
    nbf: usize,
    sub: String,
}

pub fn get_token_for_user(subject: &String, signature_psk: &String) -> Option<String> {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use log::error;
    use std::time::{SystemTime, UNIX_EPOCH};

    // get the issuing time for the token
    let token_issued_at = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs() as usize,
        Err(error) => {
            error!(
                "Could not get the issuing time for the token. The error was: {}",
                error
            );
            return None;
        }
    };

    // calculate the time when the token expires
    let token_expires_at = token_issued_at + 1 + *TOKEN_LIFETIME_IN_SECONDS;

    // define the content of the actual token
    let token_claims = Claims {
        exp: token_expires_at,
        iat: token_issued_at,
        nbf: token_issued_at + 1,
        sub: subject.clone(),
    };

    // get the signing key for the token
    let encoding_key = EncodingKey::from_secret(signature_psk.as_ref());

    // generate a new JWT for the supplied header and token claims. if we were successful, return
    // the token
    let header = Header::new(Algorithm::HS512);
    if let Ok(token) = encode(&header, &token_claims, &encoding_key) {
        return Some(token);
    }

    // if we fail, return None
    None
}
