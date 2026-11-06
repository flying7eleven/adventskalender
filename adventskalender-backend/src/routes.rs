use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use crate::guards::{AuthenticatedUser, ClientIp};
use crate::{Action, ServiceStatus, BACKOFF_HANDLER};
use chrono::{DateTime, NaiveDate};
use rand::prelude::IndexedRandom;
use rocket::http::{ContentType, Cookie, CookieJar, SameSite, Status};
use rocket::response::status::NoContent;
use rocket::response::Responder;
use rocket::serde::json::{json, Json};
use rocket::{delete, get, post, put, routes, Build, Rocket, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Mounts all routes of the backend below their base paths.
pub fn mount_routes(rocket: Rocket<Build>) -> Rocket<Build> {
    rocket
        .mount("/.well-known", routes![get_openid_configuration, get_jwks])
        .mount(
            "/v1",
            routes![
                get_login_token,
                logout,
                refresh_session,
                get_current_user,
                get_number_of_participants_who_already_won,
                pick_multiple_random_participant_from_raffle_list,
                get_all_won_participants,
                count_won_participants_on_day,
                update_participant_values,
                remove_participant_from_winner_list,
                check_backend_health,
                get_backend_version,
                update_user_password,
                get_audit_event_count,
                get_won_participants_on_day_route,
            ],
        )
}

#[derive(Serialize)]
pub struct ParticipantCount {
    /// The overall count of all participants in the raffle database.
    pub number_of_participants: i64,
    /// The number of participants who already won and are not in the raffle anymore.
    pub number_of_participants_won: i64,
    /// The number of participants who are still in the raffle since they didn't win so far.
    pub number_of_participants_still_in_raffle: i64,
}

/// See https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata for more
#[derive(Serialize)]
pub struct OpenIdConfiguration {
    pub issuer: String,
    pub jwks_uri: String,
    pub id_token_signing_alg_values_supported: Vec<String>,
}

#[derive(Serialize)]
pub struct JsonWebKey {
    pub kty: String,
    #[serde(rename = "use")]
    pub use_: String,
    pub kid: String,
    pub alg: String,
    pub crv: String,
    pub x: String,
}

#[derive(Serialize)]
pub struct JwksResponse {
    pub keys: Vec<JsonWebKey>,
}

#[get("/jwks.json")]
pub async fn get_jwks(config: &State<BackendConfiguration>) -> Result<Json<JwksResponse>, Status> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use log::error;
    use ring::signature::{Ed25519KeyPair, KeyPair};

    // parse the PKCS8 key to extract the public key
    let key_pair = match Ed25519KeyPair::from_pkcs8(&config.ed25519_key_bytes) {
        Ok(kp) => kp,
        Err(e) => {
            error!("Failed to parse Ed25519 key pair: {e}");
            return Err(Status::InternalServerError);
        }
    };

    // get the public key bytes (32 bytes for Ed25519)
    let public_key_bytes = key_pair.public_key().as_ref();

    // base64url encode the public key
    let public_key_base64 = URL_SAFE_NO_PAD.encode(public_key_bytes);

    Ok(Json(JwksResponse {
        keys: vec![JsonWebKey {
            kty: "OKP".to_string(),
            use_: "sig".to_string(),
            kid: "adventskalender-key-1".to_string(),
            alg: "EdDSA".to_string(),
            crv: "Ed25519".to_string(),
            x: public_key_base64,
        }],
    }))
}

#[get("/openid-configuration")]
pub async fn get_openid_configuration(
    config: &State<BackendConfiguration>,
) -> Result<Json<OpenIdConfiguration>, Status> {
    Ok(Json(OpenIdConfiguration {
        issuer: config.api_host.clone(),
        jwks_uri: config.jwks_uri.clone(),
        id_token_signing_alg_values_supported: vec!["EdDSA".to_string()],
    }))
}

#[get("/participants/count")]
pub async fn get_number_of_participants_who_already_won(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
) -> Result<Json<ParticipantCount>, Status> {
    use crate::schema::participants::dsl::{id, participants, won_on};
    use diesel::dsl::count;
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // log that a user queried the statistics for the participants
    debug!(
        "The user {} requested the statistics for the participants of the raffle",
        authenticated_user.username
    );

    // try to fetch the information and construct the corresponding data structure we want to
    // return, on a blocking thread so the database work does not block the async runtime
    let maybe_result = match db_connection_pool
        .run_blocking(|db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<ParticipantCount, diesel::result::Error, _>(|connection| {
                    let all_participants =
                        participants.select(count(id)).first::<i64>(connection)?;
                    let participants_won = participants
                        .filter(won_on.is_not_null())
                        .select(count(id))
                        .first::<i64>(connection)?;
                    Ok(ParticipantCount {
                        number_of_participants: all_participants,
                        number_of_participants_won: participants_won,
                        number_of_participants_still_in_raffle: all_participants - participants_won,
                    })
                })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not get the statistics for the participants. The error was: {error}");
            return Err(Status::InternalServerError);
        }
    };

    // if we could fetch a result from the database, return the requested information
    match maybe_result {
        Ok(result) => Ok(Json::from(result)),
        Err(_) => {
            // if we reach this step, we could not request the required information. Since we do
            // not know what really happened, we return an internal server error
            Err(Status::InternalServerError)
        }
    }
}

#[derive(Serialize, Clone)]
pub struct Participant {
    /// The internally used id for the participant.
    pub id: i32,
    /// The first name of the participant.
    pub first_name: String,
    /// The last name of the participant.
    pub last_name: String,
    /// The sub-package which was set for the winner.
    pub present_identifier: Option<String>,
}

pub async fn get_all_winners(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
) -> Result<HashMap<String, Vec<Participant>>, ()> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // try to get all days on which at least one person won, on a blocking thread so the database
    // work does not block the async runtime
    let maybe_result = match db_connection_pool
        .run_blocking(|db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<_, diesel::result::Error, _>(|connection| {
                    let participants_won_dates = participants
                        .filter(won_on.is_not_null())
                        .order_by(won_on.asc())
                        .load::<DatabaseParticipant>(connection)?;
                    let mut result_map = HashMap::new();
                    for current in participants_won_dates {
                        result_map
                            .entry(current.won_on.unwrap().to_string())
                            .or_insert(vec![])
                            .push(Participant {
                                id: current.id,
                                first_name: current.first_name,
                                last_name: current.last_name,
                                present_identifier: current.present_identifier,
                            });
                    }
                    Ok(result_map)
                })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not load all winners from the database. The error was: {error}");
            return Err(());
        }
    };

    maybe_result.map_err(|error| {
        error!("Could not load all winners from the database. The error was: {error}");
    })
}

pub async fn get_won_participants_on_day(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    date: NaiveDate,
) -> Result<Vec<Participant>, ()> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // try to get all participants who won on a specific day from the database, on a blocking
    // thread so the database work does not block the async runtime
    let maybe_result = match db_connection_pool
        .run_blocking(move |db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<_, diesel::result::Error, _>(|connection| {
                    let participants_won_on_date = participants
                        .filter(won_on.eq(date))
                        .load::<DatabaseParticipant>(connection)?;
                    Ok(participants_won_on_date
                        .into_iter()
                        .map(|item| Participant {
                            id: item.id,
                            first_name: item.first_name,
                            last_name: item.last_name,
                            present_identifier: item.present_identifier,
                        })
                        .collect())
                })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not load the winners from the database. The error was: {error}");
            return Err(());
        }
    };

    maybe_result.map_err(|error| {
        error!("Could not load the winners on {date} from the database. The error was: {error}");
    })
}

#[delete("/participants/won/<participant_id>")]
pub async fn remove_participant_from_winner_list(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    participant_id: i32,
    authenticated_user: AuthenticatedUser,
) -> Status {
    use log::error;

    // reset the winning state of the participant and write the audit log entry via the shared
    // helper, which runs both on a blocking thread so the database work does not block the
    // async runtime
    match mark_participant_as_not_won(
        db_connection_pool,
        participant_id,
        authenticated_user.username.clone(),
    )
    .await
    {
        Ok(()) => Status::NoContent,
        Err(RemoveWinnerError::UnknownParticipant) => Status::NotFound,
        Err(error) => {
            error!("The user {} tried to mark the participant with the id {} as NOT won but it failed. The error was: {error:?}", authenticated_user.username, participant_id);
            Status::InternalServerError
        }
    }
}

#[get("/participants/won")]
pub async fn get_all_won_participants(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    _authenticated_user: AuthenticatedUser,
) -> Result<Json<HashMap<String, Vec<Participant>>>, Status> {
    get_all_winners(db_connection_pool)
        .await
        .map(Json)
        .map_err(|_| Status::InternalServerError)
}

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
        check_rate_limit, reset_rate_limit, RateLimitConfig, RateLimitDecision,
    };
    use crate::schema::users::dsl::{password_hash, username, users};
    use bcrypt::{hash, verify};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
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
pub struct NewPackageSelection {
    /// The package the user should be assigned to.
    package: String,
}

#[put(
    "/participants/<current_participant_id>",
    data = "<new_package_selection>"
)]
pub async fn update_participant_values(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    current_participant_id: i32,
    new_package_selection: Json<NewPackageSelection>,
) -> Status {
    use crate::log_action;
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{id, participants, present_identifier};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    /// The outcome of trying to update the package selection of a participant.
    enum PackageSelectionOutcome {
        Success,
        NotFound,
        Conflict,
        UnprocessableEntity,
        InternalServerError,
    }

    let username = authenticated_user.username.clone();
    let package = new_package_selection.package.clone();

    // all database work for this request runs on a blocking thread so that neither the queries
    // nor the audit log insert block the async runtime
    let outcome = match db_connection_pool
        .run_blocking(move |db_connection| {
            // get the participant on which the package should be selected on
            let participant_won = match participants
                .filter(id.eq(current_participant_id))
                .load::<DatabaseParticipant>(db_connection)
            {
                Ok(users) => {
                    if users.len() != 1 {
                        error!("Tried to fetch the participant with the id {} from the database but got {} participants as a result", current_participant_id, users.len());
                        return PackageSelectionOutcome::NotFound;
                    }
                    users.first().unwrap().clone()
                }
                Err(error) => {
                    error!("Tried to fetch the participant with the id {current_participant_id} from the database but an error occurred. The error was: {error}");
                    return PackageSelectionOutcome::InternalServerError;
                }
            };

            //
            if participant_won.won_on.is_none() {
                error!("Tried to select a package for the participant with the id {current_participant_id} but the participant was not picked before");
                return PackageSelectionOutcome::Conflict;
            }

            // a package is one of the letters the UI offers: A up to the letter matching the
            // maximum number of winners per day; an empty string clears the selection and is
            // stored as NULL
            let highest_package_letter = b'A' + MAX_WINNERS_PER_DAY as u8 - 1;
            let selected_package: Option<String> = if package.is_empty() {
                None
            } else if package.len() == 1
                && (b'A'..=highest_package_letter).contains(&package.as_bytes()[0])
            {
                Some(package.clone())
            } else {
                return PackageSelectionOutcome::UnprocessableEntity;
            };

            // set the selected package for the participant. A unique partial index on the database
            // ensures that a package is only assigned once per day, which we report as a conflict
            match update(participants.filter(id.eq(current_participant_id)))
                .set(present_identifier.eq(selected_package))
                .execute(db_connection)
            {
                Ok(rows_updated) => {
                    if rows_updated != 1 {
                        error!("Tried to save the sub-packages {package} for the user {current_participant_id} but it failed and {rows_updated} rows were updated");
                        return PackageSelectionOutcome::InternalServerError;
                    }
                }
                Err(diesel::result::Error::DatabaseError(
                    diesel::result::DatabaseErrorKind::UniqueViolation,
                    _,
                )) => {
                    error!("Tried to select the package {package} for the user {current_participant_id} but the package was already assigned to another user for the date of this win");
                    return PackageSelectionOutcome::Conflict;
                }
                Err(error) => {
                    error!("Tried to save the sub-packages {package} for the user {current_participant_id} but it failed. The error was: {error}");
                    return PackageSelectionOutcome::InternalServerError;
                }
            }

            // if we get here we successfully selected a package; log it with the same connection
            if participant_won.present_identifier.is_none() {
                log_action(
                    db_connection,
                    Some(username),
                    Action::PackageSelected,
                    Some(format!(
                        "The participant with the id {} was assigned to package {package}",
                        current_participant_id,
                    )),
                );
            } else {
                log_action(
                    db_connection,
                    Some(username),
                    Action::PackageChanged,
                    Some(format!(
                        "The participant with the id {} was assigned a new package {package}. The previous package was {}",
                        current_participant_id,
                        participant_won.present_identifier.clone().unwrap()
                    )),
                );
            }
            PackageSelectionOutcome::Success
        })
        .await
    {
        Ok(outcome) => outcome,
        Err(error) => {
            error!("Could not update the package selection for the participant with the id {current_participant_id}. The error was: {error}");
            PackageSelectionOutcome::InternalServerError
        }
    };

    match outcome {
        PackageSelectionOutcome::Success => Status::NoContent,
        PackageSelectionOutcome::NotFound => Status::NotFound,
        PackageSelectionOutcome::Conflict => Status::Conflict,
        PackageSelectionOutcome::UnprocessableEntity => Status::UnprocessableEntity,
        PackageSelectionOutcome::InternalServerError => Status::InternalServerError,
    }
}

#[get("/participants/won/<date_as_str>")]
pub async fn get_won_participants_on_day_route(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    _authenticated_user: AuthenticatedUser,
    date_as_str: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    use std::str::FromStr;

    // if we cannot parse the input date, we received a bad parameter and we have to react to it
    let maybe_date = NaiveDate::from_str(date_as_str);
    if maybe_date.is_err() {
        return Err(Status::BadRequest);
    }

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = get_won_participants_on_day(db_connection_pool, maybe_date.unwrap()).await;

    // if we got a result, count the participants and return the amount
    if let Ok(result) = maybe_result {
        return Ok(Json(result));
    }

    // it seems that we could not gather the requested information
    Err(Status::InternalServerError)
}

#[get("/participants/won/<date_as_str>/count")]
pub async fn count_won_participants_on_day(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    date_as_str: &str,
) -> Result<Json<usize>, Status> {
    use log::debug;
    use std::str::FromStr;

    // if we cannot parse the input date, we received a bad parameter and we have to react to it
    let maybe_date = NaiveDate::from_str(date_as_str);
    if maybe_date.is_err() {
        return Err(Status::BadRequest);
    }

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = get_won_participants_on_day(db_connection_pool, maybe_date.unwrap()).await;

    // if we got a result, count the participants and return the amount
    if let Ok(winners) = maybe_result {
        debug!("The user {} queried the number of winners for the {}. The answer is: {} participants won on that day so far", authenticated_user.username, date_as_str, winners.len());
        return Ok(Json(winners.len()));
    }

    // it seems that we could not gather the requested information
    Err(Status::InternalServerError)
}

pub const MAX_WINNERS_PER_DAY: usize = 5;

#[derive(Debug)]
pub enum PickWinnersError {
    NotEnoughParticipants,
    TooManyWinnersForDay,
    UnknownUser,
    NoDatabaseConnection(r2d2::Error),
    BlockingThread(rocket::tokio::task::JoinError),
    Database(diesel::result::Error),
}

impl From<diesel::result::Error> for PickWinnersError {
    fn from(error: diesel::result::Error) -> Self {
        PickWinnersError::Database(error)
    }
}

/// Randomly picks `count` participants who did not win yet and marks them as won in one
/// transaction. The open participants stay row-locked until the commit, so a parallel pick waits
/// and, since READ COMMITTED re-checks the filter after the wait, only draws from the participants
/// who are still open afterwards.
pub async fn pick_winners(
    db_connection_pool: &AdventskalenderDatabaseConnection,
    count: usize,
    picked_for_date: NaiveDate,
    user_who_picked: &str,
) -> Result<Vec<Participant>, PickWinnersError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::lookup_user_by_name;
    use crate::models::{Participant as DatabaseParticipant, ParticipantPicking};
    use crate::schema::participants::dsl::{id, participants, won_on};
    use chrono::Utc;
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    let user_who_picked = user_who_picked.to_string();

    // the whole pick runs on a blocking thread so that the database work does not block the
    // async runtime. The open participants stay row-locked until the commit, so a parallel pick
    // waits and, since READ COMMITTED re-checks the filter after the wait, only draws from the
    // participants who are still open afterwards
    match db_connection_pool
        .run_blocking(move |db_connection| {
            db_connection
                .build_transaction()
                .read_committed()
                .read_write()
                .run(|connection| {
                    let user = match lookup_user_by_name(connection, &user_who_picked) {
                        Ok(user) => user,
                        Err(diesel::result::Error::NotFound) => {
                            return Err(PickWinnersError::UnknownUser)
                        }
                        Err(error) => return Err(PickWinnersError::Database(error)),
                    };

                    let participants_in_raffle = participants
                        .filter(won_on.is_null())
                        .for_update()
                        .load::<DatabaseParticipant>(connection)?;
                    let winners_on_day = participants
                        .filter(won_on.eq(picked_for_date))
                        .count()
                        .get_result::<i64>(connection)?
                        as usize;
                    if winners_on_day + count > MAX_WINNERS_PER_DAY {
                        return Err(PickWinnersError::TooManyWinnersForDay);
                    }

                    if participants_in_raffle.len() < count {
                        return Err(PickWinnersError::NotEnoughParticipants);
                    }

                    let winners: Vec<Participant> = participants_in_raffle
                        .choose_multiple(&mut rand::rng(), count)
                        .map(|winner| Participant {
                            id: winner.id,
                            first_name: winner.first_name.clone(),
                            last_name: winner.last_name.clone(),
                            present_identifier: None,
                        })
                        .collect();

                    update(participants.filter(id.eq_any(winners.iter().map(|winner| winner.id))))
                        .set(&ParticipantPicking {
                            won_on: Some(picked_for_date),
                            picking_time: Some(Utc::now().naive_utc()),
                            picked_by: Some(user.id),
                            present_identifier: None,
                        })
                        .execute(connection)?;

                    Ok(winners)
                })
        })
        .await
    {
        Ok(result) => result,
        Err(BlockingDatabaseError::NoConnection(error)) => {
            Err(PickWinnersError::NoDatabaseConnection(error))
        }
        Err(BlockingDatabaseError::Join(error)) => {
            error!("Could not pick winners on a blocking thread. The error was: {error}");
            Err(PickWinnersError::BlockingThread(error))
        }
    }
}

#[post("/participants/pick/<count>/for/<date>")]
pub async fn pick_multiple_random_participant_from_raffle_list(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    count: usize,
    date: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    use crate::log_action;
    use log::{debug, error};
    use std::str::FromStr;

    // if we cannot parse the input date, we received a bad parameter and we have to react to it
    let Ok(picked_for_date) = NaiveDate::from_str(date) else {
        return Err(Status::BadRequest);
    };

    let winners = match pick_winners(
        db_connection_pool,
        count,
        picked_for_date,
        &authenticated_user.username,
    )
    .await
    {
        Ok(winners) => winners,
        Err(PickWinnersError::NotEnoughParticipants) => {
            error!(
                "The user {} tried to pick {} new winners but there are not enough participants left",
                authenticated_user.username, count
            );
            return Err(Status::NotFound);
        }
        Err(PickWinnersError::TooManyWinnersForDay) => {
            error!(
                "The user {} tried to pick {} new winners but the day {} already has the maximum \
                 number of winners",
                authenticated_user.username, count, picked_for_date
            );
            return Err(Status::Conflict);
        }
        Err(error) => {
            error!(
                "The user {} tried to pick {} new winners but it failed. The error was: {:?}",
                authenticated_user.username, count, error
            );
            return Err(Status::InternalServerError);
        }
    };

    // log the picked winners on a blocking thread so that neither the inserts nor the audit log
    // block the async runtime, and return them
    let username = authenticated_user.username.clone();
    let winner_ids = winners.iter().map(|winner| winner.id).collect::<Vec<_>>();
    if let Err(error) = db_connection_pool
        .run_blocking(move |db_connection| {
            for winner_id in winner_ids {
                log_action(
                    db_connection,
                    Some(username.clone()),
                    Action::PickedWinner,
                    Some(format!(
                        "The participant with the id {winner_id} was marked as won"
                    )),
                );
            }
        })
        .await
    {
        error!("Could not log the picked winners. The error was: {error}");
    }
    debug!(
        "The user {} picked the participants with the ids {:?} as new winners",
        authenticated_user.username,
        winners.iter().map(|winner| winner.id).collect::<Vec<_>>()
    );
    Ok(Json(winners))
}

#[derive(Debug)]
pub enum RemoveWinnerError {
    UnknownParticipant,
    NoDatabaseConnection(r2d2::Error),
    BlockingThread(rocket::tokio::task::JoinError),
    Database(diesel::result::Error),
}

pub async fn mark_participant_as_not_won(
    db_connection_pool: &AdventskalenderDatabaseConnection,
    participant_id: i32,
    user_who_unpicked: String,
) -> Result<(), RemoveWinnerError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::log_action;
    use crate::models::ParticipantPicking;
    use crate::schema::participants::dsl::{id, participants};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::debug;

    // reset the winning state of the participant and write the audit log entry on a blocking
    // thread, so that the database work does not block the async runtime and both statements
    // run on the same connection
    let outcome = match db_connection_pool
        .run_blocking(move |db_connection| {
            let rows_updated = update(participants.filter(id.eq(participant_id)))
                .set(&ParticipantPicking {
                    won_on: None,
                    picking_time: None,
                    picked_by: None,
                    present_identifier: None,
                })
                .execute(db_connection)
                .map_err(RemoveWinnerError::Database)?;
            if rows_updated == 0 {
                return Err(RemoveWinnerError::UnknownParticipant);
            }

            log_action(
                db_connection,
                Some(user_who_unpicked),
                Action::RemovedWinner,
                Some(format!(
                    "The participant with the id {participant_id} was marked removed from the list of winners"
                )),
            );
            Ok(())
        })
        .await
    {
        Ok(result) => result,
        Err(BlockingDatabaseError::NoConnection(error)) => {
            Err(RemoveWinnerError::NoDatabaseConnection(error))
        }
        Err(BlockingDatabaseError::Join(error)) => Err(RemoveWinnerError::BlockingThread(error)),
    };

    if outcome.is_ok() {
        debug!("The participant with the id {participant_id} was marked as NOT won");
    }
    outcome
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
        check_rate_limit, reset_rate_limit, RateLimitConfig, RateLimitDecision,
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

        let now = crate::unix_time_now_or_fail() as u64;
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
    use crate::{
        get_token_for_user_with_auth_time, session_lifetime_in_seconds, unix_time_now_or_fail,
    };
    use log::error;

    // a session has an absolute lifetime which starts at the original login; if it is exceeded,
    // the session is terminated and the user has to log in again
    let now = unix_time_now_or_fail() as u64;
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
        .saturating_sub(crate::unix_time_now_or_fail() as u64);
    Json(UserInfo {
        username: user.username,
        expires_in,
    })
}

#[derive(Serialize)]
pub struct VersionInformation {
    /// The version of the backend which is currently running.
    pub backend_version: &'static str,
    /// The architecture the backend was build for.
    pub backend_arch: &'static str,
    /// The version of the rustc compiler used to compile the backend.
    pub rustc_version: &'static str,
    /// The date on which the backend was build.
    pub build_date: &'static str,
    /// The time on which the backend was build.
    pub build_time: String,
}

#[get("/version")]
pub async fn get_backend_version() -> Json<VersionInformation> {
    use chrono::Utc;

    Json(VersionInformation {
        backend_version: env!("VERGEN_GIT_DESCRIBE"),
        backend_arch: env!("VERGEN_CARGO_TARGET_TRIPLE"),
        rustc_version: env!("VERGEN_RUSTC_SEMVER"),
        build_date: env!("VERGEN_BUILD_DATE"),
        build_time: DateTime::parse_from_rfc3339(env!("VERGEN_BUILD_TIMESTAMP"))
            .unwrap()
            .with_timezone(&Utc)
            .time()
            .format("%H:%M:%S")
            .to_string(),
    })
}

#[derive(Serialize)]
pub struct AuditEventCount {
    /// The number of audit events written.
    pub count: i64,
}

#[get("/audit/count")]
pub async fn get_audit_event_count(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    _authenticated_user: AuthenticatedUser,
) -> Result<Json<AuditEventCount>, Status> {
    use crate::schema::performed_actions::dsl::performed_actions;
    use diesel::dsl::count_star;
    use diesel::{QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // get the number of audit events currently stored in the database, on a blocking thread so
    // the database work does not block the async runtime
    let maybe_audit_event_count = match db_connection_pool
        .run_blocking(|db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<_, diesel::result::Error, _>(|connection| {
                    match performed_actions.select(count_star()).first::<i64>(connection) {
                        Err(error) => {
                            error!("Could not get the numnber of events in the audit log. The error was: {error}");
                            Err(error)
                        }
                        Ok(count) => {
                            debug!("Got {count} events in the audit log");
                            Ok(count)
                        }
                    }
                })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not get the number of events in the audit log. The error was: {error}");
            return Err(Status::InternalServerError);
        }
    };

    // return the expected result
    match maybe_audit_event_count {
        Ok(count) => Ok(Json(AuditEventCount { count })),
        Err(_) => Err(Status::InternalServerError),
    }
}

#[derive(Serialize)]
pub struct HealthCheck {
    /// A flag which indicates if the database is healthy or not.
    pub database_healthy: bool,
    /// A flag which indicates if the backend itself is healthy or not.
    pub backend_healthy: bool,
}

pub fn notify_service_up(project_uuid: &str) {
    use healthchecks::ping::get_client;
    use log::error;

    match get_client(project_uuid) {
        Ok(client) => {
            if !client.report_success() {
                error!("Could not notify healthcheck-io about a successful health-check.");
            }
        }
        Err(error) => error!(
            "Could not notify healthcheck-io about a successful health-check. The error was: {error}"
        ),
    };
}

pub fn notify_service_down(project_uuid: &str, error_data: &str) {
    use healthchecks::ping::get_client;
    use log::error;

    match get_client(project_uuid) {
        Ok(client) => {
            if !client.report_failure_with_logs(error_data) {
                error!("Could not notify healthcheck-io about a failed health-check.");
            }
        }
        Err(error) => error!(
            "Could not notify healthcheck-io about a failed health-check. The error was: {error}"
        ),
    };
}

#[get("/health")]
pub async fn check_backend_health(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    config: &State<BackendConfiguration>,
) -> Result<Json<HealthCheck>, (Status, Json<HealthCheck>)> {
    use crate::schema::participants::dsl::participants;
    use diesel::dsl::count_star;
    use diesel::{QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // check if the connection to the database is working or not, on a blocking thread so the
    // database work does not block the async runtime
    let database_is_healthy = match db_connection_pool
        .run_blocking(|db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<_, diesel::result::Error, _>(|connection| {
                    if let Err(query_error) =
                        participants.select(count_star()).first::<i64>(connection)
                    {
                        error!("The health check of the database connection failed with the following error: {query_error}");
                        return Err(query_error);
                    }
                    debug!("Last health check was successful");
                    Ok(())
                })
        })
        .await
    {
        Ok(Ok(())) => true,
        Ok(Err(query_error)) => {
            error!("The health check of the database connection failed. The error was: {query_error}");
            false
        }
        Err(error) => {
            error!("Could not run the database health check on a blocking thread. The error was: {error}");
            false
        }
    };

    // if the database is healthy, we can return the status immediately
    if database_is_healthy {
        if !config.healthcheck_project.is_empty()
            && BACKOFF_HANDLER
                .lock()
                .unwrap()
                .should_call(ServiceStatus::Up)
        {
            // the ping itself runs fire-and-forget on a blocking thread so that the health
            // route does not wait for healthchecks.io
            let project_uuid = config.healthcheck_project.clone();
            rocket::tokio::spawn(rocket::tokio::task::spawn_blocking(move || {
                notify_service_up(&project_uuid);
            }));
        }
        return Ok(Json(HealthCheck {
            database_healthy: true,
            backend_healthy: true,
        }));
    }

    // it seems that the health check failed, indicate that by returning a 503
    Err(unhealthy_response(config, false, false))
}

fn unhealthy_response(
    config: &BackendConfiguration,
    database_healthy: bool,
    backend_healthy: bool,
) -> (Status, Json<HealthCheck>) {
    let health_check = HealthCheck {
        database_healthy,
        backend_healthy,
    };
    if !config.healthcheck_project.is_empty()
        && BACKOFF_HANDLER
            .lock()
            .unwrap()
            .should_call(ServiceStatus::Down)
    {
        // the ping itself runs fire-and-forget on a blocking thread so that the health route does
        // not wait for healthchecks.io
        let project_uuid = config.healthcheck_project.clone();
        let error_data = json!(health_check).to_string();
        rocket::tokio::spawn(rocket::tokio::task::spawn_blocking(move || {
            notify_service_down(&project_uuid, &error_data);
        }));
    }
    (Status::ServiceUnavailable, Json(health_check))
}
