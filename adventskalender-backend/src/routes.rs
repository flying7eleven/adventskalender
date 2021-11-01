use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{get, post, State};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct ParticipantCount {
    /// The overall count of all participants in the raffle database.
    pub number_of_participants: u16,
    /// The number of participants who already won and are not in the raffle anymore.
    pub number_of_participants_won: u16,
    /// The number of participants who are still in the raffle since they didn't win so far.
    pub number_of_participants_still_in_raffle: u16,
}

#[get("/participants/count")]
pub async fn get_number_of_participants_who_already_won(
    db_connection: AdventskalenderDatabaseConnection,
) -> Result<Json<ParticipantCount>, Status> {
    use crate::schema::participants::dsl::{id, participants, won_on};
    use diesel::dsl::count;
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = db_connection
        .run(|connection| {
            if let Ok(all_participants) = participants.select(count(id)).first::<i64>(connection) {
                if let Ok(participants_won) = participants
                    .filter(won_on.is_not_null())
                    .select(count(id))
                    .first::<i64>(connection)
                {
                    return Some(Json(ParticipantCount {
                        number_of_participants: all_participants as u16,
                        number_of_participants_won: participants_won as u16,
                        number_of_participants_still_in_raffle: (all_participants
                            - participants_won)
                            as u16,
                    }));
                }
            }
            return None;
        })
        .await;

    // if we could fetch a result from the database, return the requested information
    if maybe_result.is_some() {
        return Ok(maybe_result.unwrap());
    }

    // if we reach this step, we could not request the required information. Since we do not know what
    // really happened, we return an internal server error
    Err(Status::InternalServerError)
}

#[derive(Serialize)]
pub struct Participant {
    /// The internally used id for the participant.
    pub id: i32,
    /// The first name of the participant.
    pub first_name: String,
    /// The last name of the participant.
    pub last_name: String,
}

#[get("/participants/pick")]
pub async fn pick_a_random_participant_from_raffle_list(
    db_connection: AdventskalenderDatabaseConnection,
) -> Result<Json<Participant>, Status> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use rand::seq::SliceRandom;

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = db_connection
        .run(|connection| {
            if let Ok(participants_in_raffle) = participants
                .filter(won_on.is_null())
                .load::<DatabaseParticipant>(connection)
            {
                if let Some(chosen_participant) =
                    participants_in_raffle.choose(&mut rand::thread_rng())
                {
                    return Some(Json(Participant {
                        id: chosen_participant.id,
                        first_name: chosen_participant.first_name.clone(),
                        last_name: chosen_participant.last_name.clone(),
                    }));
                }
            }
            return None;
        })
        .await;

    // if we could fetch a result from the database, return the requested information
    if maybe_result.is_some() {
        return Ok(maybe_result.unwrap());
    }

    // if we could not get a result, it seems that all participants where picked at some point. Return
    // NOT FOUND to indicate that
    Err(Status::NotFound)
}

#[get("/participants/won/<participant_id>")]
pub async fn mark_participant_as_won(
    db_connection: AdventskalenderDatabaseConnection,
    participant_id: i32,
) -> Status {
    use crate::schema::participants::dsl::{id, participants, won_on};
    use chrono::Utc;
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};

    // try to update the requested participant and return if we succeeded or not
    return db_connection
        .run(move |connection| {
            if let Ok(_) = update(participants.filter(id.eq(participant_id)))
                .set(won_on.eq(Utc::now().naive_utc().date()))
                .execute(connection)
            {
                return Status::NoContent;
            }
            return Status::NotFound;
        })
        .await;
}

#[derive(Serialize, Deserialize)]
pub struct LoginInformation {
    /// The username of the user.
    username: String,
    /// The password for the login request.
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResponse {
    /// The access token to use for API requests.
    access_token: String,
}

#[post("/auth/token", data = "<login_information>")]
pub async fn get_login_token(
    db_connection: AdventskalenderDatabaseConnection,
    login_information: Json<LoginInformation>,
    config: &State<BackendConfiguration>,
) -> Result<Json<TokenResponse>, Status> {
    use crate::get_token_for_user;
    use crate::models::User;
    use crate::schema::users::dsl::{username, users};
    use bcrypt::verify;
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // try to get the user record for the supplied username
    let supplied_username = login_information.username.clone();
    let maybe_user_result = db_connection
        .run(move |connection| {
            if let Ok(found_users) = users
                .filter(username.eq(supplied_username))
                .load::<User>(connection)
            {
                // if we did not get exactly one user, return an 'error'
                if found_users.len() != 1 {
                    return None;
                }

                // return the found user
                return Some(found_users[0].clone());
            }
            return None;
        })
        .await;

    // try to get the actual user object or delay a bit and then return with the corresponding error
    let user = match maybe_user_result {
        Some(user) => user,
        None => {
            // ensure that we know what happened
            error!(
                "Could not get the user record for '{}'",
                login_information.username
            );

            // just slow down the process to prevent easy checking if a user name exists or not
            let _ = verify(
                "some_password",
                "$2y$12$7xMzqvnHyizkumZYpIRXheGMAqDKVo8HKtpmQSn51JUfY0N2VN4ua",
            );

            // finally we can tell teh user that he/she is not authorized
            return Err(Status::Unauthorized);
        }
    };

    // check if the supplied password matches the one we stored in the database using the same bcrypt
    // parameters
    match verify(&login_information.password, user.password_hash.as_str()) {
        Ok(is_password_correct) => {
            if !is_password_correct {
                return Err(Status::Unauthorized);
            }
        }
        Err(error) => {
            error!("Could not verify the supplied password with the one stored in the database. The error was: {}", error);
            return Err(Status::InternalServerError);
        }
    }

    // if we get here, the we ensured that the user is known and that the supplied password
    // was valid, we can generate a new access token and return it to the calling party
    if let Some(token) =
        get_token_for_user(&login_information.username, &config.token_signature_psk)
    {
        return Ok(Json(TokenResponse {
            access_token: token,
        }));
    }

    // it seems that we failed to generate a valid token, this should never happen, something
    // seems to be REALLY wrong
    Err(Status::InternalServerError)
}

#[derive(Serialize)]
pub struct HealthCheck {
    /// A flag which indicates if the database is healthy or not.
    pub database_healthy: bool,
    /// A flag which indicates if the backend itself is healthy or not.
    pub backend_healthy: bool,
}

#[get("/health")]
pub async fn check_backend_health(
    db_connection: AdventskalenderDatabaseConnection,
) -> Result<Json<HealthCheck>, Status> {
    use crate::schema::participants::dsl::participants;
    use diesel::expression::count::count_star;
    use diesel::{QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // check if the connection to the database is working or not
    let database_is_healthy = db_connection
        .run(|connection| {
            if let Err(error) = participants.select(count_star()).first::<i64>(connection) {
                error!("The health check of the database connection failed with the following error: {}", error);
                return false;
            }
            debug!("Last health check was successful");
            return true;
        })
        .await;

    // if the database is healthy, we can return the status immediately
    if database_is_healthy {
        return Ok(Json(HealthCheck {
            database_healthy: database_is_healthy,
            backend_healthy: true,
        }));
    }

    // if seems that the health check failed, indicate that by returning a 500
    Err(Status::InternalServerError)
}
