use crate::Action;
use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use crate::guards::{AuthenticatedUser, ClientIp};
use rocket::http::{ContentType, Cookie, CookieJar, SameSite, Status};
use rocket::response::Responder;
use rocket::response::status::NoContent;
use rocket::serde::json::{Json, json};
use rocket::{State, get, post, put};
use serde::{Deserialize, Serialize};

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
) -> Result<NoContent, PasswordChangeError> {
    use crate::log_action;
    use crate::lookup_user_by_name;
    use crate::rate_limiter::{
        RateLimitConfig, RateLimitDecision, check_rate_limit, reset_rate_limit,
    };
    use crate::schema::users::dsl::{password_hash, username, users};
    use bcrypt::{hash, verify};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, update};
    use log::{debug, error, warn};

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
    match db_connection_pool
        .run_blocking(move |db_connection| -> Result<(), PasswordChangeError> {
            // load the currently logged in user. Only if the user still exists, the supplied
            // current password can be verified against the stored one
            let current_user = match lookup_user_by_name(db_connection, &target_username) {
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

            // update the corresponding row in the database
            match update(users.filter(username.eq(&target_username)))
                .set(password_hash.eq(hashed_password))
                .execute(db_connection)
            {
                Ok(1) => {}
                Ok(_) => {
                    error!("Could not update the password since the user '{target_username}' does not exist anymore");
                    return Err(PasswordChangeError::InternalServerError);
                }
                Err(error) => {
                    error!("Could not update the password in the database. The error was: {error}");
                    return Err(PasswordChangeError::InternalServerError);
                }
            }

            // log that the user changed the own password
            log_action(
                db_connection,
                Some(target_username),
                Action::PasswordChanged,
                None,
            );

            Ok(())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not change the password. The error was: {error}");
            Err(PasswordChangeError::InternalServerError)
        }
    }?;

    // if we get here, the password was successfully updated
    debug!("Password was successfully updated",);
    Ok(NoContent)
}

#[derive(Serialize, Deserialize)]
pub struct LoginInformation {
    /// The username of the user.
    username: String,
    /// The password for the login request.
    password: String,
}

/// Issues a fresh token for `username` and sets it as the `auth_token` cookie, exactly like a
/// successful login does. Returns the expiry of the new token (UNIX seconds).
pub fn issue_session_cookie(
    username: &str,
    config: &BackendConfiguration,
    cookies: &CookieJar<'_>,
) -> Option<u64> {
    use crate::get_token_for_user;

    let (token, expires_at) = get_token_for_user(
        username,
        config.token_audience.clone(),
        config.api_host.clone(),
        &config.encoding_key,
    )?;

    // create httpOnly cookie with the token
    let mut cookie = Cookie::new("auth_token", token);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_path("/");

    // only set secure-flag if we're using HTTPS (check API host)
    if config.api_host.starts_with("https://") {
        cookie.set_secure(true);
    }

    // the cookie expires together with the token
    if let Ok(expiration) = time::OffsetDateTime::from_unix_timestamp(expires_at as i64) {
        cookie.set_expires(expiration);
    }

    cookies.add(cookie);

    Some(expires_at)
}

pub enum LoginError {
    Unauthorized,
    TooManyRequests { retry_after_seconds: u64 },
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
    use crate::log_action;
    use crate::lookup_user_by_name;
    use crate::rate_limiter::{
        RateLimitConfig, RateLimitDecision, check_rate_limit, reset_rate_limit,
    };
    use bcrypt::verify;
    use log::{error, warn};

    /// The outcome of checking the supplied credentials against the database.
    enum LoginCheckOutcome {
        Authenticated,
        Unauthorized,
        InternalServerError,
    }

    let rate_limit_config = RateLimitConfig::default();
    let client_ip = client_ip.0;
    let ip_for_logging = client_ip
        .map(|ip| ip.to_string())
        .unwrap_or("unknown".to_string());

    if let Some(ip) = client_ip {
        let ip_key = format!("ip:{ip}");
        if let RateLimitDecision::RateLimited {
            retry_after_seconds,
        } = check_rate_limit(&ip_key, &rate_limit_config)
        {
            warn!("Rate limit exceeded for IP: {ip}");
            return Err(LoginError::TooManyRequests {
                retry_after_seconds,
            });
        }
    }

    let username_key = format!("user:{}", login_information.username);
    if let RateLimitDecision::RateLimited {
        retry_after_seconds,
    } = check_rate_limit(&username_key, &rate_limit_config)
    {
        warn!(
            "Rate limit exceeded for username: {}",
            login_information.username
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
            // try to get the user record for the supplied username
            let user = match lookup_user_by_name(db_connection, &username) {
                Ok(user) => user,
                Err(diesel::result::Error::NotFound) => {
                    // ensure that we know what happened
                    error!("Could not get the user record for '{username}'");
                    // just slow down the process to prevent easy checking if a username exists
                    // or not
                    let _ = verify("some_password", crate::DUMMY_PASSWORD_HASH.as_str());

                    // log the failed attempt (use anonymous to avoid username enumeration)
                    log_action(
                        db_connection,
                        Some("anonymous".to_string()),
                        Action::FailedLogin,
                        Some(format!(
                            "Failed login attempt - invalid credentials from IP: {ip_for_logging}"
                        )),
                    );

                    // finally we can tell teh user that he/she is not authorized
                    return LoginCheckOutcome::Unauthorized;
                }
                Err(error) => {
                    error!("Could not look up the user record for '{username}'. The error was: {error}");
                    return LoginCheckOutcome::InternalServerError;
                }
            };

            // check if the supplied password matches the one we stored in the database using the
            // same bcrypt parameters
            match verify(&password, user.password_hash.as_str()) {
                Ok(is_password_correct) => {
                    if !is_password_correct {
                        log_action(
                            db_connection,
                            Some(user.username),
                            Action::FailedLogin,
                            Some(format!(
                                "Failed login attempt - invalid credentials from IP: {ip_for_logging}"
                            )),
                        );
                        return LoginCheckOutcome::Unauthorized;
                    }
                }
                Err(error) => {
                    error!("Could not verify the supplied password with the one stored in the database. The error was: {error}");
                    return LoginCheckOutcome::InternalServerError;
                }
            }

            // if we get here, we ensured that the user is known and that the supplied password
            // was valid
            LoginCheckOutcome::Authenticated
        })
        .await
    {
        Ok(outcome) => outcome,
        Err(error) => {
            error!("Could not check the supplied login credentials. The error was: {error}");
            LoginCheckOutcome::InternalServerError
        }
    };

    match outcome {
        LoginCheckOutcome::Authenticated => {}
        LoginCheckOutcome::Unauthorized => return Err(LoginError::Unauthorized),
        LoginCheckOutcome::InternalServerError => {
            return Err(LoginError::InternalServerError);
        }
    }

    // the user is known and the supplied password was valid, we can generate a new access
    // token and return it to the calling party
    if let Some(expires_at) = issue_session_cookie(&login_information.username, config, cookies) {
        // the session was issued successfully, so we can audit the successful login; if this
        // fails we keep going because the user already received a valid token
        let audit_username = login_information.username.clone();
        if let Err(error) = db_connection_pool
            .run_blocking(move |db_connection| {
                log_action(
                    db_connection,
                    Some(audit_username.clone()),
                    Action::SuccessfulLogin,
                    Some(format!(
                        "Successfully logged in user '{audit_username}' with a token"
                    )),
                )
            })
            .await
        {
            error!("Could not audit the successful login. The error was: {error}");
        }

        if let Some(ip) = client_ip {
            reset_rate_limit(&format!("ip:{ip}"));
        }
        reset_rate_limit(&format!("user:{}", login_information.username));

        let now = crate::unix_time_now() as u64;
        let expires_in = expires_at.saturating_sub(now);
        return Ok(Json(UserInfo {
            username: login_information.username.clone(),
            expires_in,
        }));
    }

    // it seems that we failed to generate a valid token. This should never happen, something
    // seems REALLY wrong
    Err(LoginError::InternalServerError)
}

#[post("/auth/refresh")]
pub async fn refresh_session(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    config: &State<BackendConfiguration>,
    cookies: &CookieJar<'_>,
) -> Result<Json<UserInfo>, Status> {
    use crate::lookup_user_by_name;
    use crate::{get_token_for_user_with_auth_time, session_lifetime_in_seconds, unix_time_now};
    use log::error;

    // a session has an absolute lifetime which starts at the original login; if it is exceeded,
    // the session is terminated and the user has to log in again
    let now = unix_time_now() as u64;
    if now.saturating_sub(authenticated_user.auth_time) >= session_lifetime_in_seconds() as u64 {
        cookies.remove(Cookie::from("auth_token"));
        return Err(Status::Forbidden);
    }

    // a refresh is only possible as long as the user still exists
    let username = authenticated_user.username.clone();
    let user_exists = match db_connection_pool
        .run_blocking(move |db_connection| lookup_user_by_name(db_connection, &username).is_ok())
        .await
    {
        Ok(user_exists) => user_exists,
        Err(error) => {
            error!(
                "Could not check the existence of the user for a refresh. The error was: {error}"
            );
            return Err(Status::InternalServerError);
        }
    };
    if !user_exists {
        cookies.remove(Cookie::from("auth_token"));
        return Err(Status::Forbidden);
    }

    // the refresh issues a new token which preserves the auth_time of the original login, so the
    // absolute session lifetime cannot be extended by refreshing
    match get_token_for_user_with_auth_time(
        &authenticated_user.username,
        config.token_audience.clone(),
        config.api_host.clone(),
        &config.encoding_key,
        authenticated_user.auth_time as usize,
    ) {
        Some((token, expires_at)) => {
            // create httpOnly cookie with the token
            let mut cookie = Cookie::new("auth_token", token);
            cookie.set_http_only(true);
            cookie.set_same_site(SameSite::Strict);
            cookie.set_path("/");
            if config.api_host.starts_with("https://") {
                cookie.set_secure(true);
            }
            if let Ok(expiration) = time::OffsetDateTime::from_unix_timestamp(expires_at as i64) {
                cookie.set_expires(expiration);
            }
            cookies.add(cookie);

            let expires_in = expires_at.saturating_sub(now);
            Ok(Json(UserInfo {
                username: authenticated_user.username,
                expires_in,
            }))
        }
        None => Err(Status::InternalServerError),
    }
}

#[post("/auth/logout")]
pub fn logout(cookies: &CookieJar<'_>) -> NoContent {
    cookies.remove(Cookie::from("auth_token"));
    NoContent
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
