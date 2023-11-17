use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
use crate::guards::AuthenticatedUser;
use crate::models::User;
use crate::Action;
use chrono::{DateTime, NaiveDate};
use diesel::{update, ExpressionMethods, NotFound, QueryDsl, RunQueryDsl};
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::yansi::Paint;
use rocket::{delete, get, post, put, State};
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
                "Could not get a connection from the database connection pool. The error was: {}",
                error
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
                        Ok(participants_won) => {
                            return Ok(ParticipantCount {
                                number_of_participants: all_participants as u16,
                                number_of_participants_won: participants_won as u16,
                                number_of_participants_still_in_raffle: (all_participants
                                    - participants_won)
                                    as u16,
                            });
                        }
                        Err(error) => return Err(error),
                    }
                }
                Err(error) => {
                    return Err(error);
                }
            }
        });

    // if we could fetch a result from the database, return the requested information
    if maybe_result.is_ok() {
        return Ok(Json::from(maybe_result.unwrap()));
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
                "Could not get a connection from the database connection pool. The error was: {}",
                error
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
                            });
                    }
                    return Ok(result_map);
                }
                Err(error) => {
                    return Err(error);
                }
            }
        });

    //
    if maybe_result.is_ok() {
        return Ok(maybe_result.unwrap());
    }
    return Err(());
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
                "Could not get a connection from the database connection pool. The error was: {}",
                error
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
                Ok(participants_won_on_date) => {
                    return Ok(participants_won_on_date
                        .iter()
                        .map(|item| Participant {
                            id: item.id,
                            first_name: item.first_name.clone(),
                            last_name: item.last_name.clone(),
                        })
                        .collect());
                }
                Err(error) => {
                    return Err(error);
                }
            }
        });

    //
    if maybe_result.is_ok() {
        return Ok(maybe_result.unwrap());
    }
    return Err(());
}

#[delete("/participants/won/<participant_id>")]
pub async fn remove_participant_from_winner_list(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    participant_id: i32,
    authenticated_user: AuthenticatedUser,
) -> Status {
    use crate::log_action_rocket;

    if mark_participant_as_not_won(
        &db_connection_pool,
        participant_id,
        authenticated_user.username.clone(),
    )
    .await
    .is_ok()
    {
        log_action_rocket(
            &db_connection_pool,
            authenticated_user.username,
            Action::RemovedWinner,
            Some(format!(
                "The participant with the id {} was marked removed from the list of winners",
                participant_id
            )),
        )
        .await;
        return Status::NoContent;
    }
    Status::NotFound
}

#[get("/participants/won")]
pub async fn get_all_won_participants(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    _authenticated_user: AuthenticatedUser,
) -> Result<Json<HashMap<String, Vec<Participant>>>, Status> {
    let maybe_all_winners = get_all_winners(db_connection_pool).await;
    if maybe_all_winners.is_ok() {
        return Ok(Json(maybe_all_winners.unwrap()));
    }
    Err(Status::NotFound)
}

#[derive(Serialize, Deserialize)]
pub struct NewPassword {
    /// The new password the user wants to set.
    first_time: String,
    /// The repeated password from the user (check if it is the equal to `first_time`).
    second_time: String,
}

#[put("/auth/password", data = "<new_password>")]
pub async fn update_user_password(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    new_password: Json<NewPassword>,
) -> Status {
    use crate::log_action_rocket;
    use crate::schema::users::dsl::{password_hash, username, users};
    use bcrypt::hash;
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // check if the passwords are the same. If not, return an corresonding error
    if new_password.first_time.ne(&new_password.second_time) {
        return Status::BadRequest;
    }

    // create a hashed version of the password which we then can store in the database. if we fail, we
    // return an error
    let maybe_hashed_password = hash(&new_password.first_time, 10);
    if maybe_hashed_password.is_err() {
        error!(
            "Could not generate an hash of a supplied password. The error was: {}",
            maybe_hashed_password.unwrap_err()
        );
        return Status::InternalServerError;
    }
    let hashed_password = maybe_hashed_password.unwrap();
    let current_user = authenticated_user.username.clone();

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Status::InternalServerError;
        }
    };

    // update the corresponding row in the database
    if let Err(error) = db_connection
        .build_transaction()
        .read_write()
        .run::<_, diesel::result::Error, _>(move |connection| {
            if let Ok(rows_updated) = update(users.filter(username.eq(authenticated_user.username.clone())))
                .set(password_hash.eq(hashed_password))
                .execute(connection)
            {
                if rows_updated != 1 {
                    error!("Expected to update exactly one row but none or more than one row were updated. This should never happen!");
                    return Err(diesel::result::Error::NotFound); // TODO: not the real error
                }
                return Ok(());
            }
            error!("Failed to update the corresponding entry");
            return Err(diesel::result::Error::NotFound); // TODO: not the real error
        })
    {
        error!(
            "Could not update the password in the database. The error was: {}",
            error
        );
        return Status::InternalServerError;
    }

    // log that the user changed the own password
    log_action_rocket(
        &db_connection_pool,
        current_user,
        Action::PasswordChanged,
        None,
    )
    .await;

    // if we get here, the password was successfully updated
    debug!("Password was successfully updated",);
    Status::NoContent
}

#[derive(Serialize, Deserialize)]
pub struct NewPackageSelection {
    /// The package the user should be assigned to.
    package: String,
}

#[put("/participants/<user_id>", data = "<new_package_selection>")]
pub async fn update_participant_values(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    authenticated_user: AuthenticatedUser,
    user_id: i32,
    new_package_selection: Json<NewPackageSelection>,
) -> Status {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{id, participants, present_identifier, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Status::InternalServerError;
        }
    };

    // get the user on which the package should be selected on
    let mut participant_won = match participants
        .filter(id.eq(user_id))
        .load::<DatabaseParticipant>(db_connection)
    {
        Ok(users) => {
            if users.len() != 1 {
                // TODO: logging
                return Status::BadRequest;
            }
            users.get(0).unwrap().clone()
        }
        Err(error) => {
            // TODO: logging
            return Status::InternalServerError;
        }
    };

    //
    if (participant_won.won_on.is_none()) {
        // TODO: logging
        return Status::InternalServerError;
    }
    let date_of_win = participant_won.won_on.unwrap();

    // get the already selected packages for the given date
    let already_selected_packages: Vec<String> = match participants
        .filter(won_on.eq(date_of_win))
        .load::<DatabaseParticipant>(db_connection)
    {
        Ok(users) => users
            .iter()
            .filter(|user| user.present_identifier.is_some())
            .map(|user| user.present_identifier.clone().unwrap())
            .collect(),
        Err(error) => {
            // TODO: logging
            return Status::InternalServerError;
        }
    };

    // check if the package was already assigned to another user
    if already_selected_packages.contains(&new_package_selection.package) {
        // TODO: logging
        return Status::BadRequest;
    }

    // set the selected package for a user
    let rows_updated = update(participants.filter(id.eq(user_id)))
        .set(present_identifier.eq(new_package_selection.package.clone()))
        .execute(db_connection); // TODO: use enum?!
    if rows_updated.is_err() || rows_updated.unwrap() != 1 {
        // TODO: logging
        return Status::InternalServerError;
    }

    // if we get here we successfully selected a package
    return Status::NoContent;
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
    if maybe_result.is_ok() {
        let winner_count = maybe_result.unwrap().len();
        debug!("The user {} queried the number of winners for the {}. The answer is: {} participants won on that day so far", authenticated_user.username, date_as_str, winner_count);
        return Ok(Json(winner_count));
    }

    // it seems that we could not gather the requested information
    Err(Status::InternalServerError)
}

pub async fn pick_random_participants_from_database(
    db_connection_pool: &AdventskalenderDatabaseConnection,
    count: usize,
) -> Option<Vec<Participant>> {
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;
    use rand::seq::SliceRandom;

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return None;
        }
    };

    //
    let maybe_result = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(move |connection| {
            match participants
                .filter(won_on.is_null())
                .load::<DatabaseParticipant>(connection)
            {
                Ok(participants_in_raffle) => {
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
                    return Ok(participants_vec);
                }
                Err(error) => {
                    return Err(error);
                }
            }
        });

    //
    if maybe_result.is_ok() {
        return Some(maybe_result.unwrap());
    }
    return None;
}

#[get("/participants/pick/<count>/for/<date>")]
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
    let maybe_date = NaiveDate::from_str(date);
    if maybe_date.is_err() {
        return Err(Status::BadRequest);
    }

    // try to get the number of random picks from the database (they are not marked as won after this call!!!)
    let maybe_result = pick_random_participants_from_database(&db_connection_pool, count).await;

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
            &db_connection_pool,
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
                &db_connection_pool,
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
    db_connection_pool: &AdventskalenderDatabaseConnection,
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

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Err(());
        }
    };

    //
    let maybe_result= db_connection
        .build_transaction()
        .read_write()
            .run::<_, diesel::result::Error, _>(move |connection| {
                // look up the user object who initiated the call
                match lookup_user_by_name(connection, user_who_picked.clone()) {
                Ok(user_obj) =>
                    {
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
                                return Err(diesel::result::Error::NotFound); // TODO: not the actual error
                            }

                            debug!("The user {} marked the users with the ids {:?} as 'won on {}'", user_who_picked, participant_ids, picked_for_date);
                            return Ok(());
                        }
                        error!("The user {} tried to mark the users with the ids {:?} as 'won on {}' but we failed to do so", user_who_picked, participant_ids, picked_for_date);
                        return Err(diesel::result::Error::NotFound); // TODO: not the actual error
                    },
                    Err(_) => {
                        // it seems that we could not look up the user who initiated the call
                        return Err(diesel::result::Error::NotFound); // TODO: not the actual error
                    }
                }
            });

    //
    if maybe_result.is_err() {
        return Err(());
    }
    return Ok(());
}

pub async fn mark_participant_as_not_won(
    db_connection_pool: &AdventskalenderDatabaseConnection,
    participant_id: i32,
    user_who_unpicked: String,
) -> Result<(), ()> {
    use crate::models::ParticipantPicking;
    use crate::schema::participants::dsl::{id, participants};
    use diesel::{update, ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Err(());
        }
    };

    let maybe_result = db_connection
        .build_transaction()
        .read_write()
        .run::<_, diesel::result::Error, _>(move |connection| {
            // set all fields to none
            let participant_info = ParticipantPicking {
                won_on: None,
                picking_time: None,
                picked_by: None,
            };

            // do the actual update of the database
            match update(participants.filter(id.eq(participant_id)))
                .set(&participant_info)
                .execute(connection)
            {
                Ok(rows_updated) =>

                    {
                        // ensure that the expected row was updated, if we did not exactly update one row, something went wrong
                        if rows_updated != 1 {
                            error!("There should be 1 row updates but {} rows were actually updated. The following ID should not be marked as NOT won: {:?}", rows_updated, participant_id);
                            return Err(diesel::result::Error::NotFound); // TODO: not really the correct error code
                        }

                        debug!("The user {} marked the user with the id {} as NOT won", user_who_unpicked, participant_id);
                        return Ok(());
                    }
                Err(error) => {
                    error!("The user {} tried to mark the user with the id {} as NOT won but we failed to do so. The error was: {}", user_who_unpicked, participant_id, error);
                    return Err(error);
                }
            }
        });

    //
    if maybe_result.is_err() {
        return Err(());
    }
    return Ok(());
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
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    login_information: Json<LoginInformation>,
    config: &State<BackendConfiguration>,
) -> Result<Json<TokenResponse>, Status> {
    use crate::get_token_for_user;
    use crate::log_action_rocket;
    use crate::schema::users::dsl::{username, users};
    use bcrypt::verify;
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Err(Status::InternalServerError);
        }
    };

    // try to get the user record for the supplied username
    let supplied_username = login_information.username.clone();
    let maybe_user_result = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(move |connection| {
            if let Ok(found_users) = users
                .filter(username.eq(supplied_username))
                .load::<User>(connection)
            {
                // if we did not get exactly one user, return an 'error'
                if found_users.len() != 1 {
                    return Err(diesel::result::Error::NotFound);
                }

                // return the found user
                return Ok(found_users[0].clone());
            }

            //
            return Err(diesel::result::Error::NotFound); // TODO: not the real error
        });

    // try to get the actual user object or delay a bit and then return with the corresponding error
    let user = match maybe_user_result {
        Ok(user) => user,
        Err(_) => {
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
                &db_connection_pool,
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
                    &db_connection_pool,
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
            &db_connection_pool,
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
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Err(Status::InternalServerError);
        }
    };

    // try to get the number of audit events currenctly stored in the database
    let maybe_audit_event_count = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(|connection| {
        return match performed_actions
            .select(count_star())
            .first::<i64>(connection)
        {
            Err(error) => {
                error!(
                    "Could not get the numnber of events in the audit log. The error was: {}",
                    error
                );
                Err(error)
            }
            Ok(count) => {
                debug!("Got {} events in the audit log", count);
                Ok(Json(AuditEventCount { count: count }))
            }
        };
    });

    // return the expected result
    return match maybe_audit_event_count {
        Ok(count) => Ok(count),
        Err(_) => Err(Status::InternalServerError),
    };
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
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
) -> Result<Json<HealthCheck>, Status> {
    use crate::schema::participants::dsl::participants;
    use diesel::dsl::count_star;
    use diesel::{QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // get a connection to the database for dealing with the request
    let db_connection = &mut match db_connection_pool.get() {
        Ok(connection) => connection,
        Err(error) => {
            error!(
                "Could not get a connection from the database connection pool. The error was: {}",
                error
            );
            return Err(Status::InternalServerError);
        }
    };

    // check if the connection to the database is working or not
    let database_is_healthy = db_connection
        .build_transaction()
        .read_only()
        .run::<_, diesel::result::Error, _>(|connection| {
            if let Err(error) = participants.select(count_star()).first::<i64>(connection) {
                error!("The health check of the database connection failed with the following error: {}", error);
                return Err(error);
            }
            debug!("Last health check was successful");
            return Ok(());
        });

    // if the database is healthy, we can return the status immediately
    if database_is_healthy.is_ok() {
        return Ok(Json(HealthCheck {
            database_healthy: true,
            backend_healthy: true,
        }));
    }

    // if seems that the health check failed, indicate that by returning a 500
    Err(Status::InternalServerError)
}
