#[macro_use]
extern crate diesel;

use crate::fairings::AdventskalenderDatabaseConnection;
use crate::models::User;
use diesel::PgConnection;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

pub mod fairings;
pub mod guards;
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

pub enum Action {
    /// A successful login request was performed
    SuccessfulLogin,
    /// A failed login request was performed
    FailedLogin,
    /// The user selected a new winner
    PickedWinner,
    /// The user removed a new winner
    RemovedWinner,
    /// The user changed their own password.
    PasswordChanged,
    /// The server indicated that the server started
    ServerStarted,
    /// The server indicated that it shuts down
    ServerTerminated,
}

impl ToString for Action {
    fn to_string(&self) -> String {
        match *self {
            Action::SuccessfulLogin => "successful_login".to_string(),
            Action::FailedLogin => "failed_login".to_string(),
            Action::PickedWinner => "picked_winner".to_string(),
            Action::RemovedWinner => "removed_winner".to_string(),
            Action::PasswordChanged => "password_changed".to_string(),
            Action::ServerStarted => "server_started".to_string(),
            Action::ServerTerminated => "server_terminated".to_string(),
        }
    }
}

pub fn lookup_user_by_name(
    db_connection: &PgConnection,
    supplied_username: String,
) -> Result<User, ()> {
    use crate::schema::users::dsl::{username, users};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    if let Ok(found_user) = users
        .filter(username.eq(supplied_username.clone()))
        .first::<User>(db_connection)
    {
        return Ok(found_user);
    }

    // it seems that the user could not be looked up
    error!(
        "Could not look up the user object for the user '{}'",
        supplied_username
    );
    return Err(());
}

pub async fn log_action_rocket(
    db_connection: &AdventskalenderDatabaseConnection,
    username_performing_action: String,
    executed_action: Action,
    possible_description: Option<String>,
) {
    return db_connection
        .run(move |connection| {
            log_action(
                &connection,
                Some(username_performing_action),
                executed_action,
                possible_description,
            );
        })
        .await;
}

pub fn log_action(
    db_connection: &PgConnection,
    username_performing_action: Option<String>,
    executed_action: Action,
    possible_description: Option<String>,
) {
    use crate::models::NewPerformedAction;
    use crate::schema::performed_actions::dsl::performed_actions;
    use chrono::Utc;
    use diesel::insert_into;
    use diesel::RunQueryDsl;
    use log::error;

    // if no username was supplied, we do not have to handle any user name lookup
    let maybe_user = if username_performing_action.is_some() {
        lookup_user_by_name(&db_connection, username_performing_action.unwrap())
    } else {
        Err(())
    };

    // ensure we have an user id wrapped in an option (a failed login request may not have a valid user name)
    let user_id = if maybe_user.is_err() {
        None
    } else {
        Some(maybe_user.unwrap().id)
    };

    // create the object we want to store in the database
    let new_logging_entry = NewPerformedAction {
        action: executed_action.to_string(),
        time_of_action: Utc::now().naive_utc(),
        description: possible_description,
        user_id,
    };

    // now we can actually insert the item
    if insert_into(performed_actions)
        .values(&new_logging_entry)
        .execute(db_connection)
        .is_err()
    {
        error!("Failed to store a new action history log entry due to a database error")
    };
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
