use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use crate::guards::{AuthenticatedUser, ClientIp};
use crate::rocket_cors::{AllowedHeaders, AllowedOrigins, CorsOptions};
use crate::{Action, BACKOFF_HANDLER};
use chrono::{DateTime, NaiveDate};
use rand::prelude::IndexedRandom;
use rocket::http::{Cookie, CookieJar, Method, SameSite, Status};
use rocket::response::status::NoContent;
use rocket::response::Responder;
use rocket::serde::json::{json, Json};
use rocket::{delete, get, options, post, put, routes, Build, Rocket, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use url::Url;

/// Mounts all routes of the backend below their base paths.
pub fn mount_routes(rocket: Rocket<Build>) -> Rocket<Build> {
    rocket
        .mount("/.well-known", routes![get_openid_configuration, get_jwks])
        .mount(
            "/v1",
            routes![
                get_login_token,
                get_login_token_options,
                logout,
                refresh_session,
                get_current_user,
                get_number_of_participants_who_already_won,
                get_number_of_participants_who_already_won_options,
                pick_multiple_random_participant_from_raffle_list,
                participants_won_options,
                get_all_won_participants,
                count_won_participants_on_day,
                update_participant_values,
                remove_participant_from_winner_list,
                check_backend_health,
                get_backend_version,
                get_backend_version_options,
                update_user_password,
                get_audit_event_count,
                get_won_participants_on_day_route,
            ],
        )
}

#[derive(Serialize)]
pub struct ParticipantCount {
    /// The overall count of all participants in the raffle database.
    pub number_of_participants: u16,
    /// The number of participants who already won and are not in the raffle anymore.
    pub number_of_participants_won: u16,
    /// The number of participants who are still in the raffle since they didn't win so far.
    pub number_of_participants_still_in_raffle: u16,
}

/// See https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata for more
#[derive(Serialize)]
pub struct OpenIdConfiguration {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String, // TODO: only if using implicit flow
    pub jwks_uri: String,
    pub response_types_supported: Vec<String>,
    pub subject_types_supported: Vec<String>,
    pub id_token_signing_alg_values_supported: Vec<String>,
}

pub fn cors_options() -> CorsOptions {
    // Use AllowedOrigins::all() for OPTIONS handlers since the actual CORS validation
    // is performed by the global CORS fairing attached in main.rs which reads from
    // ADVENTSKALENDER_CORS_ORIGINS environment variable. The OPTIONS handlers just need
    // to respond to preflight requests without being overly restrictive.
    let allowed_origins = AllowedOrigins::all();

    CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get].into_iter().map(From::from).collect(),
        allowed_headers: AllowedHeaders::all(), // AllowedHeaders::some(&["Authorization", "Accept"]),
        allow_credentials: true,
        ..Default::default()
    }
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

    // get the Ed25519 key bytes from config
    let key_bytes = match &config.ed25519_key_bytes {
        Some(bytes) => bytes,
        None => {
            error!("Ed25519 key bytes not available in configuration");
            return Err(Status::InternalServerError);
        }
    };

    // parse the PKCS8 key to extract the public key
    let key_pair = match Ed25519KeyPair::from_pkcs8(key_bytes) {
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
        authorization_endpoint: Url::parse(config.api_host.as_str())
            .unwrap()
            .join("/foo")
            .unwrap()
            .to_string(),
        token_endpoint: Url::parse(config.api_host.as_str())
            .unwrap()
            .join("/foo")
            .unwrap()
            .to_string(), // TODO: only if using implicit flow
        jwks_uri: Url::parse(config.api_host.as_str())
            .unwrap()
            .join("/.well-known/jwks.json")
            .unwrap()
            .to_string(),
        response_types_supported: vec![],
        subject_types_supported: vec![],
        id_token_signing_alg_values_supported: vec!["RS256".to_string(), "EdDSA".to_string()],
    }))
}

#[options("/participants/count")]
pub async fn get_number_of_participants_who_already_won_options<'r, 'o: 'r>(
) -> impl Responder<'r, 'o> {
    let mut options = cors_options();
    options.allowed_methods = vec![Method::Get].into_iter().map(From::from).collect();

    let cors = options.to_cors()?;
    cors.respond_owned(|guard| guard.responder(()))
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

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Err(Status::InternalServerError);
        }
    };

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = db_connection
        .build_transaction()
        .read_only()
        .run::<ParticipantCount, diesel::result::Error, _>(|connection| {
            match participants.select(count(id)).first::<i64>(connection) {
                Ok(all_participants) => {
                    match participants
                        .filter(won_on.is_not_null())
                        .select(count(id))
                        .first::<i64>(connection)
                    {
                        Ok(participants_won) => Ok(ParticipantCount {
                            number_of_participants: all_participants as u16,
                            number_of_participants_won: participants_won as u16,
                            number_of_participants_still_in_raffle: (all_participants
                                - participants_won)
                                as u16,
                        }),
                        Err(error) => Err(error),
                    }
                }
                Err(error) => Err(error),
            }
        });

    // if we could fetch a result from the database, return the requested information
    if let Ok(result) = maybe_result {
        return Ok(Json::from(result));
    }

    // if we reach this step, we could not request the required information. Since we do not know what
    // really happened, we return an internal server error
    Err(Status::InternalServerError)
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

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Err(());
        }
    };

    // try to get all days on which at least one person won
    let maybe_result = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(|connection| {
            let mut result_map = HashMap::new();
            match participants
                .filter(won_on.is_not_null())
                .order_by(won_on.asc())
                .load::<DatabaseParticipant>(connection)
            {
                Ok(participants_won_dates) => {
                    for current in participants_won_dates.iter() {
                        result_map
                            .entry(current.won_on.unwrap().to_string())
                            .or_insert(vec![])
                            .push(Participant {
                                id: current.id,
                                first_name: current.first_name.clone(),
                                last_name: current.last_name.clone(),
                                present_identifier: current.present_identifier.clone(),
                            });
                    }
                    Ok(result_map)
                }
                Err(error) => Err(error),
            }
        });

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

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Err(());
        }
    };

    // try to get all participants who won on a specific day from the database
    let maybe_result = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(move |connection| {
            match participants
                .filter(won_on.eq(date))
                .load::<DatabaseParticipant>(connection)
            {
                Ok(participants_won_on_date) => Ok(participants_won_on_date
                    .iter()
                    .map(|item| Participant {
                        id: item.id,
                        first_name: item.first_name.clone(),
                        last_name: item.last_name.clone(),
                        present_identifier: item.present_identifier.clone(),
                    })
                    .collect()),
                Err(error) => Err(error),
            }
        });

    maybe_result.map_err(|error| {
        error!("Could not load the winners on {date} from the database. The error was: {error}");
    })
}

#[options("/participants/won")]
pub async fn participants_won_options<'r, 'o: 'r>() -> impl Responder<'r, 'o> {
    let mut options = cors_options();
    options.allowed_methods = vec![Method::Get, Method::Delete]
        .into_iter()
        .map(From::from)
        .collect();

    let cors = options.to_cors()?;
    cors.respond_owned(|guard| guard.responder(()))
}

#[delete("/participants/won/<participant_id>")]
pub async fn remove_participant_from_winner_list(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    participant_id: i32,
    authenticated_user: AuthenticatedUser,
) -> Status {
    use crate::log_action_rocket;
    use log::error;

    match mark_participant_as_not_won(
        db_connection_pool,
        participant_id,
        authenticated_user.username.clone(),
    )
    .await
    {
        Ok(()) => {
            log_action_rocket(
                db_connection_pool,
                authenticated_user.username,
                Action::RemovedWinner,
                Some(format!(
                    "The participant with the id {participant_id} was marked removed from the list of winners"
                )),
            )
            .await;
            Status::NoContent
        }
        Err(RemoveWinnerError::UnknownParticipant) => Status::NotFound,
        Err(error) => {
            error!(
                "The user {} tried to mark the participant with the id {} as NOT won but it failed. The error was: {:?}",
                authenticated_user.username, participant_id, error
            );
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
    InternalServerError,
}

impl PasswordChangeError {
    fn reason(&self) -> &'static str {
        match self {
            PasswordChangeError::WrongCurrentPassword => "wrong_current_password",
            PasswordChangeError::PasswordsDoNotMatch => "passwords_do_not_match",
            PasswordChangeError::PasswordTooShort => "password_too_short",
            PasswordChangeError::PasswordTooWeak => "password_too_weak",
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

        let mut response = Response::new();
        match self {
            PasswordChangeError::InternalServerError => {
                response.set_status(Status::InternalServerError)
            }
            _ => {
                response.set_status(Status::UnprocessableEntity);
                response.set_sized_body(
                    json!({ "reason": self.reason() }).to_string().len(),
                    std::io::Cursor::new(json!({ "reason": self.reason() }).to_string()),
                );
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
    use crate::log_action_rocket;
    use crate::lookup_user_by_name;
    use crate::schema::users::dsl::{password_hash, username, users};
    use bcrypt::{hash, verify};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Err(PasswordChangeError::InternalServerError);
        }
    };

    // load the currently logged in user. Only if the user still exists, the supplied current
    // password can be verified against the stored one
    let current_user = match lookup_user_by_name(db_connection, &authenticated_user.username) {
        Ok(user) => user,
        Err(error) => {
            error!(
                "Could not find the user '{}' for a password change. The error was: {error}",
                authenticated_user.username
            );
            return Err(PasswordChangeError::InternalServerError);
        }
    };

    match verify(
        &new_password.current_password,
        current_user.password_hash.as_str(),
    ) {
        Ok(true) => {}
        Ok(false) => {
            debug!(
                "Password change rejected: the supplied current password is wrong for user '{}'",
                authenticated_user.username
            );
            return Err(PasswordChangeError::WrongCurrentPassword);
        }
        Err(error) => {
            error!("Could not verify the supplied current password. The error was: {error}");
            return Err(PasswordChangeError::InternalServerError);
        }
    }

    // check if the passwords are the same. If not, return an corresonding error
    if new_password.first_time.ne(&new_password.second_time) {
        return Err(PasswordChangeError::PasswordsDoNotMatch);
    }

    // validate password strength using the passwords crate
    use passwords::analyzer;
    use passwords::scorer;

    // enforce minimum length of 8 characters
    if new_password.first_time.len() < 8 {
        debug!("Password rejected: too short (minimum 8 characters)");
        return Err(PasswordChangeError::PasswordTooShort);
    }

    // analyze password strength
    let analyzed = analyzer::analyze(&new_password.first_time);
    let score = scorer::score(&analyzed);

    // require a minimum score of ~40 (roughly equivalent to zxcvbn score of 2)
    // the passwords crate scores 0-100, zxcvbn scores 0-4
    // score ~40 represents "Fair" strength
    if score < 40.0 {
        debug!("Password rejected: too weak (score: {score}, minimum required: 40)");
        return Err(PasswordChangeError::PasswordTooWeak);
    }

    // create a hashed version of the password which we then can store in the database. if we fail, we
    // return an error
    let maybe_hashed_password = hash(&new_password.first_time, crate::PASSWORD_HASH_COST);
    if maybe_hashed_password.is_err() {
        error!(
            "Could not generate an hash of a supplied password. The error was: {}",
            maybe_hashed_password.unwrap_err()
        );
        return Err(PasswordChangeError::InternalServerError);
    }
    let hashed_password = maybe_hashed_password.unwrap();

    // update the corresponding row in the database
    match update(users.filter(username.eq(&authenticated_user.username)))
        .set(password_hash.eq(hashed_password))
        .execute(db_connection)
    {
        Ok(1) => {}
        Ok(_) => {
            error!(
                "Could not update the password since the user '{}' does not exist anymore",
                authenticated_user.username
            );
            return Err(PasswordChangeError::InternalServerError);
        }
        Err(error) => {
            error!("Could not update the password in the database. The error was: {error}");
            return Err(PasswordChangeError::InternalServerError);
        }
    }

    // log that the user changed the own password
    log_action_rocket(
        db_connection_pool,
        authenticated_user.username,
        Action::PasswordChanged,
        None,
    )
    .await;

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
    use crate::log_action_rocket;
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{id, participants, present_identifier, won_on};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Status::InternalServerError;
        }
    };

    // get the user on which the package should be selected on
    let participant_won = match participants
        .filter(id.eq(current_participant_id))
        .load::<DatabaseParticipant>(db_connection)
    {
        Ok(users) => {
            if users.len() != 1 {
                error!("Tried to fetch the participant with the id {} from the database but got {} participants as a result", current_participant_id, users.len());
                return Status::NotFound;
            }
            users.first().unwrap().clone()
        }
        Err(error) => {
            error!("Tried to fetch the participant with the id {current_participant_id} from the database but an error occurred. The error was: {error}");
            return Status::InternalServerError;
        }
    };

    //
    if participant_won.won_on.is_none() {
        error!("Tried to select a package for the participant with the id {current_participant_id} but the participant was not picked before");
        return Status::Conflict;
    }
    let date_of_win = participant_won.won_on.unwrap();

    // variable to store a previously selected package
    let mut old_package: Option<String> = None;

    // get the already selected packages for the given date
    let already_selected_packages: Vec<String> = match participants
        .filter(won_on.eq(date_of_win))
        .load::<DatabaseParticipant>(db_connection)
    {
        Ok(users) => users
            .iter()
            .filter(|user| {
                if user.id == current_participant_id {
                    old_package = user.present_identifier.clone();
                }
                user.present_identifier.is_some()
            })
            .map(|user| user.present_identifier.clone().unwrap())
            .collect(),
        Err(error) => {
            error!("Tried to fetch the already selected sub-packages for the date {date_of_win} from the database but an error occurred. The error was: {error}");
            return Status::InternalServerError;
        }
    };

    // check if the package was already assigned to another user
    if already_selected_packages.contains(&new_package_selection.package) {
        error!("Tried to select the package {} for the user {} but the package was already assigned to another user for the date of {}", new_package_selection.package, current_participant_id, date_of_win);
        return Status::Conflict;
    }

    // set the selected package for a user
    match update(participants.filter(id.eq(current_participant_id)))
        .set(present_identifier.eq(new_package_selection.package.clone()))
        .execute(db_connection)
    {
        // TODO: use enum?!
        Ok(rows_updated) => {
            if rows_updated != 1 {
                error!("Tried to save the sub-packages {} for the user {} on {} but it failed and {} rows were updated", new_package_selection.package, current_participant_id, date_of_win, rows_updated);
                return Status::InternalServerError;
            }
        }
        Err(error) => {
            error!("Tried to save the sub-packages {} for the user {} on {} but it failed. The error was: {}", new_package_selection.package, current_participant_id, date_of_win, error);
            return Status::InternalServerError;
        }
    }

    // if we get here we successfully selected a package
    if old_package.is_none() {
        log_action_rocket(
            db_connection_pool,
            authenticated_user.username.clone(),
            Action::PackageSelected,
            Some(format!(
                "The participant with the id {} was assigned to package {}",
                current_participant_id, new_package_selection.package,
            )),
        )
        .await;
    } else {
        log_action_rocket(
            db_connection_pool,
            authenticated_user.username.clone(),
            Action::PackageChanged,
            Some(format!(
                "The participant with the id {} was assigned a new package {}. The previous package was {}",
                current_participant_id, new_package_selection.package, old_package.unwrap()
            )),
        )
            .await;
    }
    Status::NoContent
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
    use crate::lookup_user_by_name;
    use crate::models::{Participant as DatabaseParticipant, ParticipantPicking};
    use crate::schema::participants::dsl::{id, participants, won_on};
    use chrono::Utc;
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};

    let db_connection = &mut db_connection_pool
        .get()
        .map_err(PickWinnersError::NoDatabaseConnection)?;

    db_connection
        .build_transaction()
        .read_committed()
        .read_write()
        .run(|connection| {
            let user = match lookup_user_by_name(connection, user_who_picked) {
                Ok(user) => user,
                Err(diesel::result::Error::NotFound) => return Err(PickWinnersError::UnknownUser),
                Err(error) => return Err(PickWinnersError::Database(error)),
            };

            let participants_in_raffle = participants
                .filter(won_on.is_null())
                .for_update()
                .load::<DatabaseParticipant>(connection)?;
            let winners_on_day = participants
                .filter(won_on.eq(picked_for_date))
                .count()
                .get_result::<i64>(connection)? as usize;
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
}

#[post("/participants/pick/<count>/for/<date>")]
pub async fn pick_multiple_random_participant_from_raffle_list(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    count: usize,
    date: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    use crate::log_action_rocket;
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

    // log the picked winners and return them
    for winner in &winners {
        log_action_rocket(
            db_connection_pool,
            authenticated_user.username.clone(),
            Action::PickedWinner,
            Some(format!(
                "The participant with the id {} was marked as won",
                winner.id
            )),
        )
        .await;
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
    Database(diesel::result::Error),
}

pub async fn mark_participant_as_not_won(
    db_connection_pool: &AdventskalenderDatabaseConnection,
    participant_id: i32,
    user_who_unpicked: String,
) -> Result<(), RemoveWinnerError> {
    use crate::models::ParticipantPicking;
    use crate::schema::participants::dsl::{id, participants};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::debug;

    let db_connection = &mut db_connection_pool
        .get()
        .map_err(RemoveWinnerError::NoDatabaseConnection)?;

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

    debug!("The user {user_who_unpicked} marked the user with the id {participant_id} as NOT won");
    Ok(())
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
    use std::time::{SystemTime, UNIX_EPOCH};

    let (token, expires_at) = get_token_for_user(
        username,
        config.token_audience.clone(),
        config.api_host.clone(),
        &config.encoding_key.clone().unwrap(),
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

    // set expiration to match JWT expiration (1 hour)
    let expiration = time::OffsetDateTime::now_utc() + time::Duration::hours(1);
    cookie.set_expires(expiration);

    cookies.add(cookie);

    let issued_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())?;
    Some(expires_at.max(issued_at + 60 * 60))
}

#[options("/auth/token")]
pub async fn get_login_token_options<'r, 'o: 'r>() -> impl Responder<'r, 'o> {
    let mut options = cors_options();
    options.allowed_methods = vec![Method::Post].into_iter().map(From::from).collect();

    let cors = options.to_cors()?;
    cors.respond_owned(|guard| guard.responder(()))
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
) -> Result<NoContent, LoginError> {
    use crate::log_action_rocket;
    use crate::lookup_user_by_name;
    use crate::rate_limiter::{
        check_rate_limit, reset_rate_limit, RateLimitConfig, RateLimitDecision,
    };
    use bcrypt::verify;
    use log::{error, warn};

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

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Err(LoginError::InternalServerError);
        }
    };

    // try to get the user record for the supplied username
    let user = match lookup_user_by_name(db_connection, &login_information.username) {
        Ok(user) => user,
        Err(diesel::result::Error::NotFound) => {
            // ensure that we know what happened
            error!(
                "Could not get the user record for '{}'",
                login_information.username
            );
            // just slow down the process to prevent easy checking if a username exists or not
            let _ = verify("some_password", crate::DUMMY_PASSWORD_HASH.as_str());

            // log the failed attempt (use anonymous to avoid username enumeration)
            log_action_rocket(
                db_connection_pool,
                "anonymous".to_string(),
                Action::FailedLogin,
                Some(format!(
                    "Failed login attempt - invalid credentials from IP: {ip_for_logging}"
                )),
            )
            .await;

            // finally we can tell teh user that he/she is not authorized
            return Err(LoginError::Unauthorized);
        }
        Err(error) => {
            error!(
                "Could not look up the user record for '{}'. The error was: {error}",
                login_information.username
            );
            return Err(LoginError::InternalServerError);
        }
    };

    // check if the supplied password matches the one we stored in the database using the same bcrypt
    // parameters
    match verify(&login_information.password, user.password_hash.as_str()) {
        Ok(is_password_correct) => {
            if !is_password_correct {
                log_action_rocket(
                    db_connection_pool,
                    user.username.clone(),
                    Action::FailedLogin,
                    Some(format!(
                        "Failed login attempt - invalid credentials from IP: {ip_for_logging}"
                    )),
                )
                .await;
                return Err(LoginError::Unauthorized);
            }
        }
        Err(error) => {
            error!("Could not verify the supplied password with the one stored in the database. The error was: {error}");
            return Err(LoginError::InternalServerError);
        }
    }

    // if we get here, we ensured that the user is known and that the supplied password
    // was valid, we can generate a new access token and return it to the calling party
    if issue_session_cookie(&login_information.username, config, cookies).is_some() {
        if let Some(ip) = client_ip {
            reset_rate_limit(&format!("ip:{ip}"));
        }
        reset_rate_limit(&format!("user:{}", login_information.username));

        log_action_rocket(
            db_connection_pool,
            login_information.username.clone(),
            Action::SuccessfulLogin,
            Some(format!(
                "Successfully logged in user '{}' with a token",
                login_information.username
            )),
        )
        .await;

        return Ok(NoContent);
    }

    // it seems that we failed to generate a valid token. This should never happen, something
    // seems REALLY wrong
    Err(LoginError::InternalServerError)
}

#[post("/auth/refresh")]
pub async fn refresh_session(
    authenticated_user: AuthenticatedUser,
    config: &State<BackendConfiguration>,
    cookies: &CookieJar<'_>,
) -> Result<Json<UserInfo>, Status> {
    match issue_session_cookie(&authenticated_user.username, config, cookies) {
        Some(expires_at) => Ok(Json(UserInfo {
            username: authenticated_user.username,
            expires_at,
        })),
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
    /// The UNIX timestamp (in seconds) at which the token expires.
    pub expires_at: u64,
}

#[get("/auth/me")]
pub fn get_current_user(user: AuthenticatedUser) -> Json<UserInfo> {
    Json(UserInfo {
        username: user.username,
        expires_at: user.expires_at,
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

#[options("/version")]
pub async fn get_backend_version_options<'r, 'o: 'r>() -> impl Responder<'r, 'o> {
    let mut options = cors_options();
    options.allowed_methods = vec![Method::Get].into_iter().map(From::from).collect();

    let cors = options.to_cors()?;
    cors.respond_owned(|guard| guard.responder(()))
}

#[derive(Serialize)]
pub struct AuditEventCount {
    /// The number of audit events written.
    pub count: i64,
}

#[get("/audit/count")]
pub async fn get_audit_event_count(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
) -> Result<Json<AuditEventCount>, Status> {
    use crate::schema::performed_actions::dsl::performed_actions;
    use diesel::dsl::count_star;
    use diesel::{QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {error}"
            );
            return Err(Status::InternalServerError);
        }
    };

    // try to get the number of audit events currenctly stored in the database
    let maybe_audit_event_count = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(|connection| {
        match performed_actions
            .select(count_star())
            .first::<i64>(connection)
        {
            Err(error) => {
                error!(
                    "Could not get the numnber of events in the audit log. The error was: {error}"
                );
                Err(error)
            }
            Ok(count) => {
                debug!("Got {count} events in the audit log");
                Ok(Json(AuditEventCount { count }))
            }
        }
    });

    // return the expected result
    match maybe_audit_event_count {
        Ok(count) => Ok(count),
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

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(pool_error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {pool_error}"
            );
            return Err(unhealthy_response(config, false, false));
        }
    };

    // check if the connection to the database is working or not
    let database_is_healthy = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(|connection| {
            if let Err(query_error) = participants.select(count_star()).first::<i64>(connection) {
                error!(
                    "The health check of the database connection failed with the following error: {query_error}"
                );
                return Err(query_error);
            }
            debug!("Last health check was successful");
            Ok(())
        });

    // if the database is healthy, we can return the status immediately
    if database_is_healthy.is_ok() {
        if !config.healthcheck_project.is_empty() {
            BACKOFF_HANDLER
                .lock()
                .unwrap()
                .call(|| notify_service_up(&config.healthcheck_project));
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
    if !config.healthcheck_project.is_empty() {
        BACKOFF_HANDLER.lock().unwrap().call(|| {
            notify_service_down(
                &config.healthcheck_project,
                &json!(health_check).to_string(),
            )
        });
    }
    (Status::ServiceUnavailable, Json(health_check))
}
