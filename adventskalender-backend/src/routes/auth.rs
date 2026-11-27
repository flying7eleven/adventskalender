use crate::Action;
use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use crate::guards::{AuthenticatedUser, AuthorizationError, ClientIp};
use rocket::http::{ContentType, Cookie, CookieJar, SameSite, Status};
use rocket::response::Responder;
use rocket::response::status::{Custom, NoContent};
use rocket::serde::json::{Json, json};
use rocket::{State, get, post, put};
use serde::{Deserialize, Serialize};

/// The longest username the backend accepts, matching the `users.username` column.
const MAX_USERNAME_BYTES: usize = 64;
/// The longest new password the backend accepts, since bcrypt only uses the first 72 bytes.
const MAX_PASSWORD_BYTES: usize = 72;

#[derive(Serialize, Deserialize)]
pub struct NewPassword {
    /// The password the user currently uses.
    current_password: String,
    /// The new password the user wants to set.
    first_time: String,
    /// The repeated password from the user (check if it is the equal to `first_time`).
    second_time: String,
}

/// The reason why a requested password change was rejected, answered with a 422 and a JSON body
/// of the shape `{"reason": "..."}`.
pub enum PasswordChangeError {
    WrongCurrentPassword,
    PasswordsDoNotMatch,
    PasswordTooShort,
    PasswordTooLong,
    PasswordTooWeak,
    TooManyRequests { retry_after_seconds: u64 },
    InternalServerError,
}

impl PasswordChangeError {
    fn reason(&self) -> &'static str {
        match self {
            PasswordChangeError::WrongCurrentPassword => "wrong_current_password",
            PasswordChangeError::PasswordsDoNotMatch => "passwords_do_not_match",
            PasswordChangeError::PasswordTooShort => "password_too_short",
            PasswordChangeError::PasswordTooLong => "password_too_long",
            PasswordChangeError::PasswordTooWeak => "password_too_weak",
            PasswordChangeError::TooManyRequests { .. } => "too_many_requests",
            PasswordChangeError::InternalServerError => "internal_server_error",
        }
    }
}

impl<'r> Responder<'r, 'static> for PasswordChangeError {
    fn respond_to(
        self,
        _request: &'r rocket::Request<'_>,
    ) -> Result<rocket::response::Response<'static>, Status> {
        use rocket::response::Response;

        let body = json!({ "reason": self.reason() }).to_string();
        let mut response = Response::new();
        response.set_header(ContentType::JSON);
        match self {
            PasswordChangeError::InternalServerError => {
                response.set_status(Status::InternalServerError)
            }
            PasswordChangeError::TooManyRequests {
                retry_after_seconds,
            } => {
                response.set_status(Status::TooManyRequests);
                response.set_raw_header("Retry-After", retry_after_seconds.to_string());
                response.set_sized_body(body.len(), std::io::Cursor::new(body));
            }
            _ => {
                response.set_status(Status::UnprocessableEntity);
                response.set_sized_body(body.len(), std::io::Cursor::new(body));
            }
        }
        Ok(response)
    }
}

#[put("/auth/password", data = "<new_password>")]
pub async fn update_user_password(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    new_password: Json<NewPassword>,
    config: &State<BackendConfiguration>,
    cookies: &CookieJar<'_>,
) -> Result<NoContent, PasswordChangeError> {
    use crate::models::User;
    use crate::rate_limiter::{
        RateLimitConfig, RateLimitDecision, check_rate_limit, reset_rate_limit,
    };
    use crate::record_action;
    use crate::schema::users::dsl::{password_hash, session_epoch, users};
    use bcrypt::{hash, verify};
    use diesel::{Connection, ExpressionMethods, QueryDsl, RunQueryDsl, update};
    use log::{debug, error, warn};

    let user_id = authenticated_user.user_id;
    let target_username = authenticated_user.username.clone();
    let current_password = new_password.current_password.clone();
    let first_time = new_password.first_time.clone();
    let second_time = new_password.second_time.clone();

    // the current-password check is rate limited per user, so that the correct password cannot
    // be brute forced through the password change endpoint
    let rate_limit_config = RateLimitConfig::default();
    let rate_limit_key = format!("pwchange:{target_username}");
    if let RateLimitDecision::RateLimited {
        retry_after_seconds,
    } = check_rate_limit(&rate_limit_key, &rate_limit_config)
    {
        warn!("Rate limit exceeded for password changes of the user: {target_username}");
        return Err(PasswordChangeError::TooManyRequests {
            retry_after_seconds,
        });
    }

    // the user lookup, the bcrypt verification and hashing, the update and the audit log all run
    // on a blocking thread so that neither the database work nor the password hashing block the
    // async runtime
    let new_session_epoch = match db_connection_pool
        .run_blocking(move |db_connection| -> Result<i32, PasswordChangeError> {
            let current_user = match users.find(user_id).first::<User>(db_connection) {
                Ok(user) => user,
                Err(error) => {
                    error!("Could not find the user '{target_username}' for a password change. The error was: {error}");
                    return Err(PasswordChangeError::InternalServerError);
                }
            };

            match verify(&current_password, current_user.password_hash.as_str()) {
                Ok(true) => {}
                Ok(false) => {
                    debug!("Password change rejected: the supplied current password is wrong for user '{target_username}'");
                    return Err(PasswordChangeError::WrongCurrentPassword);
                }
                Err(error) => {
                    error!("Could not verify the supplied current password. The error was: {error}");
                    return Err(PasswordChangeError::InternalServerError);
                }
            }

            // the current password was correct, so the failed-attempt counter of the rate
            // limiter is reset before the new password is even validated
            reset_rate_limit(&rate_limit_key);

            // check if the passwords are the same. If not, return an corresonding error
            if first_time.ne(&second_time) {
                return Err(PasswordChangeError::PasswordsDoNotMatch);
            }

            // validate password strength using the passwords crate
            use passwords::analyzer;
            use passwords::scorer;

            // enforce minimum length of 8 characters
            if first_time.chars().count() < 8 {
                debug!("Password rejected: too short (minimum 8 characters)");
                return Err(PasswordChangeError::PasswordTooShort);
            }

            // bcrypt would silently ignore everything after the first 72 bytes
            if first_time.len() > MAX_PASSWORD_BYTES {
                debug!("Password rejected: too long (maximum {MAX_PASSWORD_BYTES} bytes)");
                return Err(PasswordChangeError::PasswordTooLong);
            }

            // analyze password strength
            let analyzed = analyzer::analyze(&first_time);
            let score = scorer::score(&analyzed);

            // require a minimum score of ~40 (roughly equivalent to zxcvbn score of 2)
            // the passwords crate scores 0-100, zxcvbn scores 0-4
            // score ~40 represents "Fair" strength
            if score < 40.0 {
                debug!("Password rejected: too weak (score: {score}, minimum required: 40)");
                return Err(PasswordChangeError::PasswordTooWeak);
            }

            // create a hashed version of the password which we then can store in the database.
            // if we fail, we return an error
            let hashed_password = match hash(&first_time, crate::PASSWORD_HASH_COST) {
                Ok(hashed_password) => hashed_password,
                Err(error) => {
                    error!("Could not generate an hash of a supplied password. The error was: {error}");
                    return Err(PasswordChangeError::InternalServerError);
                }
            };

            // the new password ends all sessions of the user by bumping the session epoch, and is
            // audited in the same transaction
            db_connection
                .transaction(|connection| {
                    let new_session_epoch = update(users.find(user_id))
                        .set((
                            password_hash.eq(hashed_password),
                            session_epoch.eq(session_epoch + 1),
                        ))
                        .returning(session_epoch)
                        .get_result::<i32>(connection)?;
                    record_action(connection, Some(user_id), Action::PasswordChanged, None)?;
                    Ok(new_session_epoch)
                })
                .map_err(|error: diesel::result::Error| {
                    error!("Could not store the new password. The error was: {error}");
                    PasswordChangeError::InternalServerError
                })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not change the password. The error was: {error}");
            Err(PasswordChangeError::InternalServerError)
        }
    }?;

    // the session which changed the password keeps working with a token for the new epoch
    match crate::get_token_for_user_with_auth_time(
        &authenticated_user.username,
        user_id,
        new_session_epoch,
        config.token_audience.clone(),
        config.api_host.clone(),
        &config.encoding_key,
        authenticated_user.auth_time as usize,
    ) {
        Some((token, expires_at)) => set_session_cookie(token, expires_at, config, cookies),
        None => {
            error!("Could not issue a new token after the password was changed");
            return Err(PasswordChangeError::InternalServerError);
        }
    }

    debug!("Password was successfully updated");
    Ok(NoContent)
}

#[derive(Serialize, Deserialize)]
pub struct LoginInformation {
    /// The username of the user.
    username: String,
    /// The password for the login request.
    password: String,
}

/// Issues a fresh token for the user and sets it as the `auth_token` cookie, exactly like a
/// successful login does. Returns the expiry of the new token (UNIX seconds).
pub fn issue_session_cookie(
    username: &str,
    user_id: i32,
    session_epoch: i32,
    config: &BackendConfiguration,
    cookies: &CookieJar<'_>,
) -> Option<u64> {
    use crate::get_token_for_user;

    let (token, expires_at) = get_token_for_user(
        username,
        user_id,
        session_epoch,
        config.token_audience.clone(),
        config.api_host.clone(),
        &config.encoding_key,
    )?;
    set_session_cookie(token, expires_at, config, cookies);

    Some(expires_at)
}

/// Sets `token` as the HTTP-only `auth_token` cookie which expires together with the token at
/// `expires_at` (UNIX seconds).
fn set_session_cookie(
    token: String,
    expires_at: u64,
    config: &BackendConfiguration,
    cookies: &CookieJar<'_>,
) {
    let mut cookie = Cookie::new("auth_token", token);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_path("/");
    cookie.set_secure(config.cookie_secure);
    if let Ok(expiration) = time::OffsetDateTime::from_unix_timestamp(expires_at as i64) {
        cookie.set_expires(expiration);
    }
    cookies.add(cookie);
}

pub enum LoginError {
    /// The username is longer than any valid one.
    BadRequest,
    Unauthorized,
    TooManyRequests {
        retry_after_seconds: u64,
    },
    InternalServerError,
}

impl<'r> Responder<'r, 'static> for LoginError {
    fn respond_to(
        self,
        _request: &'r rocket::Request<'_>,
    ) -> Result<rocket::response::Response<'static>, Status> {
        use rocket::response::Response;

        let mut response = Response::new();
        match self {
            LoginError::BadRequest => response.set_status(Status::BadRequest),
            LoginError::Unauthorized => response.set_status(Status::Unauthorized),
            LoginError::TooManyRequests {
                retry_after_seconds,
            } => {
                response.set_status(Status::TooManyRequests);
                response.set_raw_header("Retry-After", retry_after_seconds.to_string());
            }
            LoginError::InternalServerError => response.set_status(Status::InternalServerError),
        }
        Ok(response)
    }
}

#[post("/auth/token", data = "<login_information>")]
pub async fn get_login_token(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    login_information: Json<LoginInformation>,
    config: &State<BackendConfiguration>,
    client_ip: ClientIp,
    cookies: &CookieJar<'_>,
) -> Result<Json<UserInfo>, LoginError> {
    use crate::rate_limiter::{
        LOGIN_ATTEMPTS_PER_IP, LOGIN_ATTEMPTS_PER_USERNAME, RateLimitDecision, check_rate_limit,
        client_ip_key, reset_rate_limit,
    };
    use crate::{lookup_user_by_name, record_action};
    use bcrypt::verify;
    use log::{debug, error, warn};

    /// The outcome of checking the supplied credentials against the database.
    enum LoginCheckOutcome {
        Authenticated { user_id: i32, session_epoch: i32 },
        Unauthorized,
        InternalServerError,
    }

    // the login input is never logged, since a password might have been typed into the username
    // field; an oversized username is rejected before it reaches the rate limiter or the database.
    // passwords of any length are verified, since existing passwords may be longer than the limit
    // for new ones and bcrypt only uses their first 72 bytes
    if login_information.username.len() > MAX_USERNAME_BYTES {
        debug!("Rejected a login request with an oversized username");
        return Err(LoginError::BadRequest);
    }

    let ip_key = client_ip.0.map(client_ip_key);
    let ip_for_logging = client_ip
        .0
        .map(|ip| ip.to_string())
        .unwrap_or("unknown".to_string());

    if let Some(ip_key) = &ip_key
        && let RateLimitDecision::RateLimited {
            retry_after_seconds,
        } = check_rate_limit(ip_key, &LOGIN_ATTEMPTS_PER_IP)
    {
        warn!("Rate limit exceeded for logins from {ip_key}");
        return Err(LoginError::TooManyRequests {
            retry_after_seconds,
        });
    }

    let username_key = format!("user:{}", login_information.username);
    if let RateLimitDecision::RateLimited {
        retry_after_seconds,
    } = check_rate_limit(&username_key, &LOGIN_ATTEMPTS_PER_USERNAME)
    {
        warn!(
            "Rate limit exceeded for the logins of a username, requested from IP: {ip_for_logging}"
        );
        return Err(LoginError::TooManyRequests {
            retry_after_seconds,
        });
    }

    let username = login_information.username.clone();
    let password = login_information.password.clone();

    // the user lookup, the bcrypt verification and the audit log all run on a blocking thread so
    // that neither the database work nor the password hashing block the async runtime
    let outcome = match db_connection_pool
        .run_blocking(move |db_connection| {
            let failed_login_description =
                format!("Failed login attempt - invalid credentials from IP: {ip_for_logging}");

            let user = match lookup_user_by_name(db_connection, &username) {
                Ok(user) => user,
                Err(diesel::result::Error::NotFound) => {
                    debug!("Login failed for an unknown username from IP: {ip_for_logging}");
                    // just slow down the process to prevent easy checking if a username exists
                    // or not
                    let _ = verify("some_password", crate::DUMMY_PASSWORD_HASH.as_str());

                    // the failed attempt is audited without a user to avoid username enumeration
                    if let Err(error) = record_action(
                        db_connection,
                        None,
                        Action::FailedLogin,
                        Some(failed_login_description),
                    ) {
                        error!("Could not audit a failed login. The error was: {error}");
                    }
                    return LoginCheckOutcome::Unauthorized;
                }
                Err(error) => {
                    error!("Could not look up the user record for a login. The error was: {error}");
                    return LoginCheckOutcome::InternalServerError;
                }
            };

            // check if the supplied password matches the one we stored in the database using the
            // same bcrypt parameters
            match verify(&password, user.password_hash.as_str()) {
                Ok(true) => LoginCheckOutcome::Authenticated {
                    user_id: user.id,
                    session_epoch: user.session_epoch,
                },
                Ok(false) => {
                    debug!("Login failed for the user '{}' with a wrong password", user.username);
                    if let Err(error) = record_action(
                        db_connection,
                        Some(user.id),
                        Action::FailedLogin,
                        Some(failed_login_description),
                    ) {
                        error!("Could not audit a failed login. The error was: {error}");
                    }
                    LoginCheckOutcome::Unauthorized
                }
                Err(error) => {
                    error!("Could not verify the supplied password with the one stored in the database. The error was: {error}");
                    LoginCheckOutcome::InternalServerError
                }
            }
        })
        .await
    {
        Ok(outcome) => outcome,
        Err(error) => {
            error!("Could not check the supplied login credentials. The error was: {error}");
            LoginCheckOutcome::InternalServerError
        }
    };

    let (user_id, session_epoch) = match outcome {
        LoginCheckOutcome::Authenticated {
            user_id,
            session_epoch,
        } => (user_id, session_epoch),
        LoginCheckOutcome::Unauthorized => return Err(LoginError::Unauthorized),
        LoginCheckOutcome::InternalServerError => {
            return Err(LoginError::InternalServerError);
        }
    };

    // the user is known and the supplied password was valid, we can generate a new access
    // token and return it to the calling party
    let Some(expires_at) = issue_session_cookie(
        &login_information.username,
        user_id,
        session_epoch,
        config,
        cookies,
    ) else {
        error!("Could not issue a token for a successful login");
        return Err(LoginError::InternalServerError);
    };

    // the session was issued successfully, so we can audit the successful login; if this fails
    // we keep going because the user already received a valid token
    let audit_description = format!(
        "Successfully logged in user '{}' with a token",
        login_information.username
    );
    match db_connection_pool
        .run_blocking(move |db_connection| {
            record_action(
                db_connection,
                Some(user_id),
                Action::SuccessfulLogin,
                Some(audit_description),
            )
        })
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => error!("Could not audit the successful login. The error was: {error}"),
        Err(error) => error!("Could not audit the successful login. The error was: {error}"),
    }

    if let Some(ip_key) = &ip_key {
        reset_rate_limit(ip_key);
    }
    reset_rate_limit(&username_key);

    let now = crate::unix_time_now() as u64;
    Ok(Json(UserInfo {
        username: login_information.username.clone(),
        expires_in: expires_at.saturating_sub(now),
    }))
}

/// Issues a new token for a valid session. A rejected token or an exceeded session lifetime
/// removes the session cookie.
#[post("/auth/refresh")]
pub async fn refresh_session(
    authenticated_user: Result<AuthenticatedUser, AuthorizationError>,
    config: &State<BackendConfiguration>,
    cookies: &CookieJar<'_>,
) -> Result<Json<UserInfo>, Custom<()>> {
    use crate::{get_token_for_user_with_auth_time, session_lifetime_in_seconds, unix_time_now};

    // the error responses below are no catchers, so the removal of the cookie reaches the client;
    // a token which could not be validated may still be valid, so its cookie is kept
    let authenticated_user = match authenticated_user {
        Ok(user) => user,
        Err(AuthorizationError::CannotValidateToken) => {
            return Err(Custom(Status::InternalServerError, ()));
        }
        Err(_) => {
            cookies.remove(Cookie::from("auth_token"));
            return Err(Custom(Status::Forbidden, ()));
        }
    };

    // a session has an absolute lifetime which starts at the original login; if it is exceeded,
    // the session is terminated and the user has to log in again
    let now = unix_time_now() as u64;
    if now.saturating_sub(authenticated_user.auth_time) >= session_lifetime_in_seconds() as u64 {
        cookies.remove(Cookie::from("auth_token"));
        return Err(Custom(Status::Forbidden, ()));
    }

    // the guard already ensured that the user still exists and that the session was not revoked;
    // the refresh issues a new token for the same epoch which preserves the auth_time of the
    // original login, so the absolute session lifetime cannot be extended by refreshing
    match get_token_for_user_with_auth_time(
        &authenticated_user.username,
        authenticated_user.user_id,
        authenticated_user.session_epoch,
        config.token_audience.clone(),
        config.api_host.clone(),
        &config.encoding_key,
        authenticated_user.auth_time as usize,
    ) {
        Some((token, expires_at)) => {
            set_session_cookie(token, expires_at, config, cookies);

            let expires_in = expires_at.saturating_sub(now);
            Ok(Json(UserInfo {
                username: authenticated_user.username,
                expires_in,
            }))
        }
        None => Err(Custom(Status::InternalServerError, ())),
    }
}

/// Removes the session cookie and, if the request carries a valid token, ends all sessions of
/// its user by bumping the session epoch.
#[post("/auth/logout")]
pub async fn logout(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: Result<AuthenticatedUser, AuthorizationError>,
    cookies: &CookieJar<'_>,
) -> Result<NoContent, Custom<()>> {
    use crate::schema::users::dsl::{session_epoch, users};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, update};
    use log::error;

    // the cookie is removed in every case; the error responses below are no catchers, so the
    // removal reaches the client
    cookies.remove(Cookie::from("auth_token"));

    let user_id = match authenticated_user {
        Ok(user) => user.user_id,
        Err(AuthorizationError::CannotValidateToken) => {
            return Err(Custom(Status::InternalServerError, ()));
        }
        Err(_) => return Ok(NoContent),
    };

    match db_connection_pool
        .run_blocking(move |db_connection| {
            update(users.find(user_id))
                .set(session_epoch.eq(session_epoch + 1))
                .execute(db_connection)
        })
        .await
    {
        Ok(Ok(_)) => Ok(NoContent),
        Ok(Err(error)) => {
            error!("Could not end the sessions of a user on logout. The error was: {error}");
            Err(Custom(Status::InternalServerError, ()))
        }
        Err(error) => {
            error!("Could not end the sessions of a user on logout. The error was: {error}");
            Err(Custom(Status::InternalServerError, ()))
        }
    }
}

#[derive(Serialize)]
pub struct UserInfo {
    pub username: String,
    /// The number of whole seconds until the current token expires, as computed by the server.
    pub expires_in: u64,
}

#[get("/auth/me")]
pub fn get_current_user(user: AuthenticatedUser) -> Json<UserInfo> {
    let expires_in = user
        .expires_at
        .saturating_sub(crate::unix_time_now() as u64);
    Json(UserInfo {
        username: user.username,
        expires_in,
    })
}
