use crate::Action;
use crate::fairings::AdventskalenderDatabaseConnection;
use crate::guards::AuthenticatedUser;
use chrono::NaiveDate;
use rand::prelude::IndexedRandom;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{State, delete, get, post, put};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize)]
pub struct ParticipantCount {
    /// The overall count of all participants in the raffle database.
    pub number_of_participants: i64,
    /// The number of participants who already won and are not in the raffle anymore.
    pub number_of_participants_won: i64,
    /// The number of participants who are still in the raffle since they didn't win so far.
    pub number_of_participants_still_in_raffle: i64,
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

#[derive(Debug)]
pub enum WinnersError {
    NoDatabaseConnection(r2d2::Error),
    BlockingThread(rocket::tokio::task::JoinError),
    Database(diesel::result::Error),
}

pub async fn get_all_winners(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
) -> Result<HashMap<String, Vec<Participant>>, WinnersError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // try to get all days on which at least one person won, on a blocking thread so the database
    // work does not block the async runtime
    match db_connection_pool
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
        Ok(result) => result
            .inspect_err(|error| {
                error!("Could not load all winners from the database. The error was: {error}")
            })
            .map_err(WinnersError::Database),
        Err(BlockingDatabaseError::NoConnection(error)) => {
            Err(WinnersError::NoDatabaseConnection(error))
        }
        Err(BlockingDatabaseError::Join(error)) => {
            error!("Could not load all winners on a blocking thread. The error was: {error}");
            Err(WinnersError::BlockingThread(error))
        }
    }
}

pub async fn get_won_participants_on_day(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    date: NaiveDate,
) -> Result<Vec<Participant>, WinnersError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{participants, won_on};
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
    use log::error;

    // try to get all participants who won on a specific day from the database, on a blocking
    // thread so the database work does not block the async runtime
    match db_connection_pool
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
        Ok(result) => result
            .inspect_err(|error| {
                error!(
                    "Could not load the winners on {date} from the database. The error was: {error}"
                )
            })
            .map_err(WinnersError::Database),
        Err(BlockingDatabaseError::NoConnection(error)) => {
            Err(WinnersError::NoDatabaseConnection(error))
        }
        Err(BlockingDatabaseError::Join(error)) => {
            error!("Could not load the winners on a blocking thread. The error was: {error}");
            Err(WinnersError::BlockingThread(error))
        }
    }
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
            error!(
                "The user {} tried to mark the participant with the id {} as NOT won but it failed. The error was: {error:?}",
                authenticated_user.username, participant_id
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
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, update};
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
            } else if package.is_empty() {
                log_action(
                    db_connection,
                    Some(username),
                    Action::PackageChanged,
                    Some(format!(
                        "The package selection of the participant with the id {} was removed. The previous package was {}",
                        current_participant_id,
                        participant_won.present_identifier.clone().unwrap()
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
        debug!(
            "The user {} queried the number of winners for the {}. The answer is: {} participants won on that day so far",
            authenticated_user.username,
            date_as_str,
            winners.len()
        );
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
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, update};
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
                            return Err(PickWinnersError::UnknownUser);
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
                        .sample(&mut rand::rng(), count)
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
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, update};
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
