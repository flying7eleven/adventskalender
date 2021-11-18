use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use crate::guards::AuthenticatedUser;
use crate::models::User;
use crate::Action;
use chrono::NaiveDate;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{get, post, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    authenticated_user: AuthenticatedUser,
) -> Result<Json<ParticipantCount>, Status> {
    use crate::schema::participants::dsl::{id, participants, won_on};
    use diesel::dsl::count;
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::debug;

    // log that a user queried the statistics for the participants
    debug!(
        "The user {} requested the statistics for the participants of the raffle",
        authenticated_user.username
    );

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

#[derive(Serialize, Clone)]
pub struct Participant {
    /// The internally used id for the participant.
    pub id: i32,
    /// The first name of the participant.
    pub first_name: String,
    /// The last name of the participant.
    pub last_name: String,
}

pub async fn get_all_winners(
    db_connection: AdventskalenderDatabaseConnection,
) -> Result<HashMap<String, Vec<Participant>>, ()> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};

    // try to get all days on which at least one person won
    return db_connection
        .run(|connection| {
            let mut result_map = HashMap::new();
            if let Ok(participants_won_dates) = participants
                .filter(won_on.is_not_null())
                .order_by(won_on.asc())
                .load::<DatabaseParticipant>(connection)
            {
                for current in participants_won_dates.iter() {
                    result_map
                        .entry(current.won_on.unwrap().to_string())
                        .or_insert(vec![])
                        .push(Participant {
                            id: current.id,
                            first_name: current.first_name.clone(),
                            last_name: current.last_name.clone(),
                        });
                }
                return Ok(result_map);
            }
            return Err(());
        })
        .await;
}

pub async fn get_won_participants_on_day(
    db_connection: AdventskalenderDatabaseConnection,
    date: NaiveDate,
) -> Result<Vec<Participant>, ()> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};

    // try to get all participants who won on a specific day from the database
    return db_connection
        .run(move |connection| {
            if let Ok(participants_won_on_date) = participants
                .filter(won_on.eq(date))
                .load::<DatabaseParticipant>(connection)
            {
                return Ok(participants_won_on_date
                    .iter()
                    .map(|item| Participant {
                        id: item.id,
                        first_name: item.first_name.clone(),
                        last_name: item.last_name.clone(),
                    })
                    .collect());
            }
            return Err(());
        })
        .await;
}

#[get("/participants/won/<date_as_str>")]
pub async fn get_won_participants_on_day_route(
    db_connection: AdventskalenderDatabaseConnection,
    _authenticated_user: AuthenticatedUser,
    date_as_str: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    use log::{debug, error};
    use std::str::FromStr;

    // if we cannot parse the input date, we received a bad parameter and we have to react to it
    let maybe_date = NaiveDate::from_str(date_as_str);
    if maybe_date.is_err() {
        return Err(Status::BadRequest);
    }

    // try to fetch the information, if this fails, return an error
    let maybe_result = get_won_participants_on_day(db_connection, maybe_date.unwrap()).await;
    if maybe_result.is_err() {
        error!(
            "Could not query the won participants for the {}",
            date_as_str
        );
        return Err(Status::InternalServerError);
    }

    // if we reach this step, we can return the participants who won
    let won_participants = maybe_result.unwrap();
    debug!(
        "Returning {} participants who won on {}",
        won_participants.len(),
        date_as_str
    );
    Ok(Json(won_participants))
}

#[get("/participants/won")]
pub async fn get_all_won_participants(
    db_connection: AdventskalenderDatabaseConnection,
    _authenticated_user: AuthenticatedUser,
) -> Result<Json<HashMap<String, Vec<Participant>>>, Status> {
    let maybe_all_winners = get_all_winners(db_connection).await;
    if maybe_all_winners.is_ok() {
        return Ok(Json(maybe_all_winners.unwrap()));
    }
    Err(Status::NotFound)
}

#[get("/participants/won/<date_as_str>/count")]
pub async fn count_won_participants_on_day(
    db_connection: AdventskalenderDatabaseConnection,
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
    let maybe_result = get_won_participants_on_day(db_connection, maybe_date.unwrap()).await;

    // if we got a result, count the participants and return the amount
    if maybe_result.is_ok() {
        let winner_count = maybe_result.unwrap().len();
        debug!("The user {} queried the number of winners for the {}. The answer is: {} participants won on that day so far", authenticated_user.username, date_as_str, winner_count);
        return Ok(Json(winner_count));
    }

    // it seems that we could not gather the requested information
    Err(Status::InternalServerError)
}

pub async fn pick_random_participants_from_database(
    db_connection: &AdventskalenderDatabaseConnection,
    count: usize,
) -> Option<Vec<Participant>> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use rand::seq::SliceRandom;

    return db_connection
        .run(move |connection| {
            if let Ok(participants_in_raffle) = participants
                .filter(won_on.is_null())
                .load::<DatabaseParticipant>(connection)
            {
                let mut participants_vec = vec![];
                for current_participant in
                    participants_in_raffle.choose_multiple(&mut rand::thread_rng(), count)
                {
                    participants_vec.push(Participant {
                        id: current_participant.id,
                        first_name: current_participant.first_name.clone(),
                        last_name: current_participant.last_name.clone(),
                    });
                }
                return Some(participants_vec);
            }
            return None;
        })
        .await;
}

#[get("/participants/pick")]
pub async fn pick_a_random_participant_from_raffle_list(
    db_connection: AdventskalenderDatabaseConnection,
    authenticated_user: AuthenticatedUser,
) -> Result<Json<Participant>, Status> {
    use log::{debug, error};

    // try to get one random pick from the database (it is not marked as won after this call)
    let maybe_result = pick_random_participants_from_database(&db_connection, 1).await;

    // if we could fetch a result from the database, return the requested information
    if maybe_result.is_some() {
        let result = maybe_result.unwrap();

        // ensure that we got exactly one result for this call. Otherwise something went wrong
        if result.len() != 1 {
            error!("Got {} participants who won from the database but we expected to receive exactly 1", result.len());
            return Err(Status::InternalServerError);
        }

        // log that we picked a winner and return it
        let participant_who_won = result.get(0).unwrap();
        debug!(
            "The user {} picked the participant with the id {} as a new winner",
            authenticated_user.username, participant_who_won.id
        );
        return Ok(Json(participant_who_won.clone()));
    }

    // if we could not get a result, it seems that all participants where picked at some point. Return
    // NOT FOUND to indicate that
    error!(
        "The user {} tried to pick a new winner but we could not find one",
        authenticated_user.username
    );
    Err(Status::NotFound)
}

#[get("/participants/pick/<count>/for/<date>")]
pub async fn pick_multiple_random_participant_from_raffle_list(
    db_connection: AdventskalenderDatabaseConnection,
    authenticated_user: AuthenticatedUser,
    count: usize,
    date: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    use crate::log_action_rocket;
    use log::{debug, error};
    use std::str::FromStr;

    // if we cannot parse the input date, we received a bad parameter and we have to react to it
    let maybe_date = NaiveDate::from_str(date);
    if maybe_date.is_err() {
        return Err(Status::BadRequest);
    }

    // try to get the number of random picks from the database (they are not marked as won after this call)
    let maybe_result = pick_random_participants_from_database(&db_connection, count).await;

    // if we could fetch a result from the database, return the requested information
    if maybe_result.is_some() {
        let result = maybe_result.unwrap();

        // ensure that we got exactly one result for this call. Otherwise something went wrong
        if result.len() != count {
            error!("Got {} participants who won from the database but we expected to receive {} winners", result.len(), count);
            return Err(Status::InternalServerError);
        }

        // after we have all participants we wanted to select, we have to mark them as won before we can
        // return them
        let won_participant_ids: Vec<i32> = result.iter().map(|p| p.id).collect();
        if mark_participant_as_won(
            &db_connection,
            won_participant_ids.clone(),
            maybe_date.unwrap(),
            authenticated_user.username.clone(),
        )
        .await
        .is_err()
        {
            error!("Failed to mark all picked participants as won. Returning an error since it is not guaranteed that the pick would be genuine.");
            return Err(Status::InternalServerError);
        }

        // log the picked winners and return them
        for current_participant_id in won_participant_ids.clone() {
            log_action_rocket(
                &db_connection,
                authenticated_user.username.clone(),
                Action::PickedWinner,
                Some(format!(
                    "The participant with the id {} was marked as won",
                    current_participant_id
                )),
            )
            .await;
        }
        debug!(
            "The user {} picked the participants with the ids {:?} as new winners",
            authenticated_user.username, won_participant_ids
        );
        return Ok(Json(result.clone()));
    }

    // if we could not get a result, it seems that all participants where picked at some point. Return
    // NOT FOUND to indicate that
    error!(
        "The user {} tried to pick a new winner but we could not find one",
        authenticated_user.username
    );
    Err(Status::NotFound)
}

#[derive(Serialize, Deserialize)]
pub struct PickingInformation {
    /// The participant who was picked as a winner
    participant_id: i32,
    /// The date for which the winner was picked
    picked_for_date: NaiveDate,
}

pub async fn mark_participant_as_won(
    db_connection: &AdventskalenderDatabaseConnection,
    participant_ids: Vec<i32>,
    picked_for_date: NaiveDate,
    user_who_picked: String,
) -> Result<(), ()> {
    use crate::lookup_user_by_name;
    use crate::models::ParticipantPicking;
    use crate::schema::participants::dsl::{id, participants};
    use chrono::Utc;
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::{debug, error};

    return db_connection
            .run(move |connection| {
                // look up the user object who initiated the call
                if let Ok(user_obj) = lookup_user_by_name(&connection, user_who_picked.clone()) {

                    // create the struct with the update information for the picked user
                    let participant_info = ParticipantPicking {
                        won_on: Some(picked_for_date),
                        picking_time: Some(Utc::now().naive_utc()),
                        picked_by: Some(user_obj.id),
                    };

                    // do the actual update of the database
                    if let Ok(rows_updated) = update(participants.filter(id.eq_any(participant_ids.clone())))
                        .set(&participant_info)
                        .execute(connection)
                    {
                        // ensure that all rows were successfully updated. If not, we have to assume an error and log it before exit here
                        if rows_updated != participant_ids.len() {
                            error!("There should be {} row updates but {} rows were actually updated. The following IDs should not be marked as won: {:?}", participant_ids.len(), rows_updated, participant_ids);
                            return Err(());
                        }

                        debug!("The user {} marked the users with the ids {:?} as 'won on {}'", user_who_picked, participant_ids, picked_for_date);
                        return Ok(());
                    }
                    error!("The user {} tried to mark the users with the ids {:?} as 'won on {}' but we failed to do so", user_who_picked, participant_ids, picked_for_date);
                    return Err(());
                }

                // it seems that we could not look up the user who initiated the call
                Err(())
            })
            .await;
}

#[post("/participants/won", data = "<picking_information>")]
pub async fn mark_participant_as_won_route(
    db_connection: AdventskalenderDatabaseConnection,
    picking_information: Json<PickingInformation>,
    authenticated_user: AuthenticatedUser,
) -> Status {
    use crate::log_action_rocket;

    if mark_participant_as_won(
        &db_connection,
        vec![picking_information.participant_id],
        picking_information.picked_for_date,
        authenticated_user.username.clone(),
    )
    .await
    .is_ok()
    {
        log_action_rocket(
            &db_connection,
            authenticated_user.username,
            Action::PickedWinner,
            Some(format!(
                "The participant with the id {} was marked as won",
                picking_information.participant_id
            )),
        )
        .await;
        return Status::NoContent;
    }
    Status::NotFound
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
    use crate::log_action_rocket;
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

            // log the failed attempt
            log_action_rocket(
                &db_connection,
                login_information.username.clone(),
                Action::FailedLogin,
                Some(format!(
                    "Failed login attempt for user name '{}'",
                    login_information.username.clone()
                )),
            )
            .await;

            // finally we can tell teh user that he/she is not authorized
            return Err(Status::Unauthorized);
        }
    };

    // check if the supplied password matches the one we stored in the database using the same bcrypt
    // parameters
    match verify(&login_information.password, user.password_hash.as_str()) {
        Ok(is_password_correct) => {
            if !is_password_correct {
                log_action_rocket(
                    &db_connection,
                    login_information.username.clone(),
                    Action::FailedLogin,
                    None,
                )
                .await;
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
        log_action_rocket(
            &db_connection,
            login_information.username.clone(),
            Action::SuccessfulLogin,
            None,
        )
        .await;
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
