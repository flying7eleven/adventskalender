use crate::models::User;
use chrono::{DateTime, Utc};
use diesel::PgConnection;
use jsonwebtoken::EncodingKey;
use log::debug;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::fmt::{Display, Formatter};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime};

pub mod cors;
pub mod fairings;
pub mod guards;
pub mod models;
pub mod rate_limiter;
pub mod routes;
mod schema;

/// The time in seconds a token is valid.
const TOKEN_LIFETIME_IN_SECONDS: usize = 60 * 60;
/// The absolute time in seconds a session may last, starting from the original login.
const SESSION_LIFETIME_IN_SECONDS: usize = 12 * 60 * 60;

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
    use log::error;

    // failed logins are logged as "anonymous" to prevent username enumeration and have no user id
    let user_id = match maybe_username_performing_action.as_deref() {
        None | Some("anonymous") => None,
        Some(username_performing_action) => {
            match lookup_user_by_name(db_connection, username_performing_action) {
                Ok(user) => Some(user.id),
                Err(error) => {
                    error!(
                        "Could not look up the user object for the user '{username_performing_action}'. The error was: {error}"
                    );
                    None
                }
            }
        }
    };

    if record_action(
        db_connection,
        user_id,
        executed_action,
        possible_description,
    )
    .is_err()
    {
        error!("Failed to store a new action history log entry due to a database error")
    };
}

/// Writes an audit log entry and reports a failure to the caller, so that it can be written in
/// the same transaction as the audited state change and roll that change back on failure.
pub fn record_action(
    db_connection: &mut PgConnection,
    user_id: Option<i32>,
    executed_action: Action,
    possible_description: Option<String>,
) -> Result<(), diesel::result::Error> {
    use crate::models::NewPerformedAction;
    use crate::schema::performed_actions::dsl::performed_actions;
    use chrono::Utc;
    use diesel::RunQueryDsl;
    use diesel::insert_into;

    insert_into(performed_actions)
        .values(&NewPerformedAction {
            action: executed_action.to_string(),
            time_of_action: Utc::now().naive_utc(),
            description: possible_description,
            user_id,
        })
        .execute(db_connection)
        .map(|_| ())
}

pub fn get_token_for_user(
    subject: &str,
    audience: HashSet<String>,
    issuer: String,
    encoding_key: &EncodingKey,
) -> Option<(String, u64)> {
    get_token_for_user_with_auth_time(subject, audience, issuer, encoding_key, unix_time_now())
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
    use jsonwebtoken::{Algorithm, Header, encode};
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

    // calculate the time when the token expires, but never later than the absolute session
    // lifetime which started at the original login
    let token_expires_at = (token_issued_at + 1 + TOKEN_LIFETIME_IN_SECONDS)
        .min(auth_time + SESSION_LIFETIME_IN_SECONDS);

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
    let mut header = Header::new(Algorithm::EdDSA);
    header.kid = Some(crate::fairings::SIGNING_KEY_ID.to_string());
    if let Ok(token) = encode(&header, &token_claims, encoding_key) {
        return Some((token, token_expires_at as u64));
    }

    // if we fail, return None
    None
}

/// The current UNIX time in seconds, or 0 if the system clock is before the epoch.
pub fn unix_time_now() -> usize {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as usize)
        .unwrap_or(0)
}

/// The absolute lifetime of a session in seconds, starting from the original login.
pub fn session_lifetime_in_seconds() -> usize {
    SESSION_LIFETIME_IN_SECONDS
}

/// Assembles the backend with all routes, fairings and managed state. The binary and the
/// integration tests share it, so the tests exercise the same stack which runs in production.
pub fn build_rocket<T: rocket::figment::Provider>(
    figment: T,
    configuration: fairings::BackendConfiguration,
    database: fairings::AdventskalenderDatabaseConnection,
    cors: cors::Cors,
) -> rocket::Rocket<rocket::Build> {
    routes::mount_routes(
        rocket::custom(figment)
            .attach(cors)
            .attach(fairings::SecurityHeaders)
            .manage(configuration)
            .manage(database),
    )
}

#[cfg(test)]
mod tests {
    use super::{BackoffHandler, ServiceStatus};
    use std::time::Duration;

    #[test]
    fn an_issued_token_carries_the_key_id_of_the_signing_key() {
        use jsonwebtoken::EncodingKey;
        use ring::rand::SystemRandom;
        use ring::signature::Ed25519KeyPair;
        use std::collections::HashSet;

        let document = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        let (token, _) = super::get_token_for_user(
            "someone",
            HashSet::from(["https://example.com".to_string()]),
            "https://example.com".to_string(),
            &EncodingKey::from_ed_der(document.as_ref()),
        )
        .unwrap();

        let header = jsonwebtoken::decode_header(&token).unwrap();
        assert_eq!(header.kid.as_deref(), Some(crate::fairings::SIGNING_KEY_ID));
    }

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
