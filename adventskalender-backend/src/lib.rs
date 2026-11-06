#[macro_use]
extern crate diesel;

use crate::models::User;
use chrono::{DateTime, Utc};
use diesel::PgConnection;
use jsonwebtoken::EncodingKey;
use lazy_static::lazy_static;
use log::debug;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::fmt::{Display, Formatter};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime};

/// Builds the CORS fairing used by the backend and its tests: only requests from the given
/// origins are allowed, and preflight requests are answered by the fairing itself.
pub fn cors_fairing<I, S>(allowed_origins: I) -> Result<rocket_cors::Cors, rocket_cors::Error>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let exact_origins: Vec<S> = allowed_origins.into_iter().collect();
    let allowed_origins = rocket_cors::AllowedOrigins::some_exact(&exact_origins);
    rocket_cors::CorsOptions {
        allowed_origins,
        allowed_methods: vec![
            rocket::http::Method::Get,
            rocket::http::Method::Post,
            rocket::http::Method::Put,
            rocket::http::Method::Delete,
        ]
        .into_iter()
        .map(From::from)
        .collect(),
        allowed_headers: rocket_cors::AllowedHeaders::All,
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors()
}

pub mod fairings;
pub mod guards;
pub mod models;
pub mod rate_limiter;
pub mod rocket_cors;
pub mod routes;
mod schema;

lazy_static! {
    /// The time in seconds a token is valid.
    static ref TOKEN_LIFETIME_IN_SECONDS: usize = 60 * 60;
    /// The absolute time in seconds a session may last, starting from the original login.
    static ref SESSION_LIFETIME_IN_SECONDS: usize = 12 * 60 * 60;
}

pub static BACKOFF_HANDLER: LazyLock<Mutex<BackoffHandler>> =
    LazyLock::new(|| Mutex::new(BackoffHandler::from(Duration::from_secs(600))));

/// The bcrypt cost factor used when hashing passwords.
pub const PASSWORD_HASH_COST: u32 = 10;

/// A hash of a fixed dummy password. It is verified against user input when the username is
/// unknown so that login timing does not reveal whether the username exists.
pub static DUMMY_PASSWORD_HASH: LazyLock<String> =
    LazyLock::new(|| bcrypt::hash("some_password", PASSWORD_HASH_COST).unwrap());

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    exp: usize,
    iat: usize,
    nbf: usize,
    /// The UNIX time (in seconds) of the original login of the session, which a refresh
    /// preserves so that the absolute session lifetime can be enforced.
    auth_time: usize,
    sub: String,
    iss: String,
    aud: HashSet<String>,
}

/// The service status a healthcheck.io ping reports.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ServiceStatus {
    /// The service is healthy.
    Up,
    /// The service is unhealthy.
    Down,
}

#[derive(Clone)]
pub struct BackoffHandler {
    last_call: SystemTime,
    last_status: Option<ServiceStatus>,
    backoff_time: Duration,
}

impl From<Duration> for BackoffHandler {
    fn from(backoff_duration: Duration) -> Self {
        // set the last call time far enough in the past so that the first ping for a status is
        // always sent immediately
        BackoffHandler {
            last_call: SystemTime::now() - (backoff_duration * 2),
            last_status: None,
            backoff_time: backoff_duration,
        }
    }
}

impl BackoffHandler {
    /// Decides whether a ping for the given status should be sent now and records the decision:
    /// a ping is always sent when the status changed, since only repeated pings of the same
    /// status within the backoff window are suppressed. This way a flapping database (down, up,
    /// down) always reports every status change.
    pub fn should_call(&mut self, status: ServiceStatus) -> bool {
        if self.last_status != Some(status)
            || self.last_call + self.backoff_time < SystemTime::now()
        {
            let datetime: DateTime<Utc> = self.last_call.into();
            debug!(
                "Calling method since the last call time was {} and the back off duration was {}s",
                datetime.to_rfc3339(),
                self.backoff_time.as_secs()
            );
            self.last_status = Some(status);
            self.last_call = SystemTime::now();
            true
        } else {
            false
        }
    }
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
    /// The user selected a specific (initial) package for the user
    PackageSelected,
    /// The user edited the selected package for the user
    PackageChanged,
    /// The user changed their own password.
    PasswordChanged,
    /// The server indicated that the server started
    ServerStarted,
    /// The server indicated that it shuts down
    ServerTerminated,
}

impl Display for Action {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match *self {
            Action::SuccessfulLogin => write!(f, "successful_login"),
            Action::FailedLogin => write!(f, "failed_login"),
            Action::PickedWinner => write!(f, "picked_winner"),
            Action::PackageSelected => write!(f, "package_selected"),
            Action::PackageChanged => write!(f, "package_changed"),
            Action::RemovedWinner => write!(f, "removed_winner"),
            Action::PasswordChanged => write!(f, "password_changed"),
            Action::ServerStarted => write!(f, "server_started"),
            Action::ServerTerminated => write!(f, "server_terminated"),
        }
    }
}

pub fn lookup_user_by_name(
    db_connection: &mut PgConnection,
    supplied_username: &str,
) -> Result<User, diesel::result::Error> {
    use crate::schema::users::dsl::{username, users};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};

    users
        .filter(username.eq(supplied_username))
        .first::<User>(db_connection)
}

pub fn log_action(
    db_connection: &mut PgConnection,
    maybe_username_performing_action: Option<String>,
    executed_action: Action,
    possible_description: Option<String>,
) {
    use crate::models::NewPerformedAction;
    use crate::schema::performed_actions::dsl::performed_actions;
    use chrono::Utc;
    use diesel::insert_into;
    use diesel::RunQueryDsl;
    use log::error;

    // failed logins are logged as "anonymous" to prevent username enumeration and have no user id
    let user_id = match maybe_username_performing_action.as_deref() {
        None | Some("anonymous") => None,
        Some(username_performing_action) => {
            match lookup_user_by_name(db_connection, username_performing_action) {
                Ok(user) => Some(user.id),
                Err(error) => {
                    error!("Could not look up the user object for the user '{username_performing_action}'. The error was: {error}");
                    None
                }
            }
        }
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

pub fn get_token_for_user(
    subject: &str,
    audience: HashSet<String>,
    issuer: String,
    encoding_key: &EncodingKey,
) -> Option<(String, u64)> {
    get_token_for_user_with_auth_time(
        subject,
        audience,
        issuer,
        encoding_key,
        unix_time_now_or_fail(),
    )
}

/// Issues a token for `subject` which keeps the supplied `auth_time` (the UNIX time in seconds of
/// the original login of the session), so that a refresh cannot extend the absolute session
/// lifetime. Returns the expiry of the new token (UNIX seconds).
pub fn get_token_for_user_with_auth_time(
    subject: &str,
    audience: HashSet<String>,
    issuer: String,
    encoding_key: &EncodingKey,
    auth_time: usize,
) -> Option<(String, u64)> {
    use jsonwebtoken::{encode, Algorithm, Header};
    use log::error;
    use std::time::{SystemTime, UNIX_EPOCH};

    // get the issuing time for the token
    let token_issued_at = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs() as usize,
        Err(error) => {
            error!("Could not get the issuing time for the token. The error was: {error}");
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
        auth_time,
        sub: subject.to_owned(),
        iss: issuer,
        aud: audience,
    };

    // generate a new JWT for the supplied header and token claims. if we were successful, return
    // the token
    let header = Header::new(Algorithm::EdDSA);
    if let Ok(token) = encode(&header, &token_claims, encoding_key) {
        return Some((token, token_expires_at as u64));
    }

    // if we fail, return None
    None
}

/// The current UNIX time in seconds, or `None` if the system clock is before the epoch.
pub fn unix_time_now_or_fail() -> usize {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as usize)
        .unwrap_or(0)
}

/// The absolute lifetime of a session in seconds, starting from the original login.
pub fn session_lifetime_in_seconds() -> usize {
    *SESSION_LIFETIME_IN_SECONDS
}

#[cfg(test)]
mod tests {
    use super::{BackoffHandler, ServiceStatus};
    use std::time::Duration;

    #[test]
    fn down_ping_is_sent_immediately_after_an_up_ping() {
        let mut handler = BackoffHandler::from(Duration::from_secs(600));
        assert!(handler.should_call(ServiceStatus::Up));
        // the up ping must not suppress the down ping, since a status change is always reported
        assert!(handler.should_call(ServiceStatus::Down));
    }

    #[test]
    fn repeated_up_pings_within_the_backoff_window_are_suppressed() {
        let mut handler = BackoffHandler::from(Duration::from_secs(600));
        assert!(handler.should_call(ServiceStatus::Up));
        assert!(!handler.should_call(ServiceStatus::Up));
        assert!(!handler.should_call(ServiceStatus::Up));
    }

    #[test]
    fn repeated_down_pings_within_the_backoff_window_are_suppressed() {
        let mut handler = BackoffHandler::from(Duration::from_secs(600));
        assert!(handler.should_call(ServiceStatus::Down));
        assert!(!handler.should_call(ServiceStatus::Down));
    }

    #[test]
    fn a_status_change_is_always_reported_even_within_the_backoff_window() {
        // simulate a flapping database: down, up, down within the backoff window
        let mut handler = BackoffHandler::from(Duration::from_secs(600));
        assert!(handler.should_call(ServiceStatus::Down));
        assert!(handler.should_call(ServiceStatus::Up));
        assert!(
            handler.should_call(ServiceStatus::Down),
            "the second down ping must be sent since the status changed"
        );
    }

    #[test]
    fn the_first_ping_of_a_status_is_sent_immediately() {
        let mut handler = BackoffHandler::from(Duration::from_secs(600));
        assert!(handler.should_call(ServiceStatus::Down));
        assert!(handler.should_call(ServiceStatus::Up));
    }
}
