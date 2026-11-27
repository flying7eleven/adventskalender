use crate::Action;
use crate::fairings::AdventskalenderDatabaseConnection;
use crate::guards::AuthenticatedUser;
use rand::prelude::IndexedRandom;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{State, delete, get, post, put};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use time::macros::format_description;
use time::{Date, Month, OffsetDateTime};

/// Parses a day given as `YYYY-MM-DD`; month and day may omit their leading zero.
fn parse_day(value: &str) -> Option<Date> {
    Date::parse(
        value,
        format_description!("[year]-[month padding:none]-[day padding:none]"),
    )
    .ok()
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
) -> Result<BTreeMap<String, Vec<Participant>>, WinnersError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{id, participants, won_on};
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
                        .order_by((won_on.asc(), id.asc()))
                        .load::<DatabaseParticipant>(connection)?;
                    let mut result_map = BTreeMap::new();
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
    date: Date,
) -> Result<Vec<Participant>, WinnersError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::models::Participant as DatabaseParticipant;
    use crate::schema::participants::dsl::{id, participants, won_on};
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
                        .order_by(id.asc())
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
        authenticated_user.user_id,
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
) -> Result<Json<BTreeMap<String, Vec<Participant>>>, Status> {
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
    use crate::record_action;
    use crate::schema::participants::dsl::{id, participants, present_identifier, won_on};
    use diesel::result::{DatabaseErrorKind, Error as DieselError};
    use diesel::{Connection, ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl, update};
    use log::error;

    /// The reasons why updating the package selection of a participant can fail.
    enum PackageSelectionError {
        UnknownParticipant,
        NotAWinner,
        PackageAlreadyAssigned,
        Database(DieselError),
    }

    impl From<DieselError> for PackageSelectionError {
        fn from(error: DieselError) -> Self {
            PackageSelectionError::Database(error)
        }
    }

    let user_id = authenticated_user.user_id;
    let package = new_package_selection.package.clone();

    // a package is one of the letters the UI offers: A up to the letter matching the maximum
    // number of winners per day; an empty string clears the selection and is stored as NULL
    let highest_package_letter = b'A' + MAX_WINNERS_PER_DAY as u8 - 1;
    let selected_package: Option<String> = if package.is_empty() {
        None
    } else if package.len() == 1 && (b'A'..=highest_package_letter).contains(&package.as_bytes()[0])
    {
        Some(package.clone())
    } else {
        return Status::UnprocessableEntity;
    };

    // the update and its audit log entry run in one transaction on a blocking thread, so that a
    // failing audit insert rolls the update back and the async runtime is not blocked
    let outcome = db_connection_pool
        .run_blocking(move |db_connection| {
            db_connection.transaction(|connection| {
                let previous_package = participants
                    .filter(id.eq(current_participant_id))
                    .select(present_identifier)
                    .for_update()
                    .first::<Option<String>>(connection)
                    .optional()?
                    .ok_or(PackageSelectionError::UnknownParticipant)?;

                // only winners can get a package; a unique partial index on the database ensures
                // that a package is only assigned once per day
                let rows_updated = update(
                    participants
                        .filter(id.eq(current_participant_id))
                        .filter(won_on.is_not_null()),
                )
                .set(present_identifier.eq(selected_package))
                .execute(connection)
                .map_err(|error| match error {
                    DieselError::DatabaseError(DatabaseErrorKind::UniqueViolation, _) => {
                        PackageSelectionError::PackageAlreadyAssigned
                    }
                    error => PackageSelectionError::Database(error),
                })?;
                if rows_updated == 0 {
                    return Err(PackageSelectionError::NotAWinner);
                }

                let (action, description) = match previous_package {
                    None => (
                        Action::PackageSelected,
                        format!(
                            "The participant with the id {current_participant_id} was assigned to package {package}"
                        ),
                    ),
                    Some(previous_package) if package.is_empty() => (
                        Action::PackageChanged,
                        format!(
                            "The package selection of the participant with the id {current_participant_id} was removed. The previous package was {previous_package}"
                        ),
                    ),
                    Some(previous_package) => (
                        Action::PackageChanged,
                        format!(
                            "The participant with the id {current_participant_id} was assigned a new package {package}. The previous package was {previous_package}"
                        ),
                    ),
                };
                record_action(connection, Some(user_id), action, Some(description))?;
                Ok(())
            })
        })
        .await;

    match outcome {
        Ok(Ok(())) => Status::NoContent,
        Ok(Err(PackageSelectionError::UnknownParticipant)) => Status::NotFound,
        Ok(Err(PackageSelectionError::NotAWinner)) => {
            error!(
                "Tried to select a package for the participant with the id {current_participant_id} but the participant was not picked before"
            );
            Status::Conflict
        }
        Ok(Err(PackageSelectionError::PackageAlreadyAssigned)) => {
            error!(
                "Tried to select a package for the participant with the id {current_participant_id} but the package was already assigned to another participant for the date of this win"
            );
            Status::Conflict
        }
        Ok(Err(PackageSelectionError::Database(error))) => {
            error!(
                "Could not update the package selection for the participant with the id {current_participant_id}. The error was: {error}"
            );
            Status::InternalServerError
        }
        Err(error) => {
            error!(
                "Could not update the package selection for the participant with the id {current_participant_id}. The error was: {error}"
            );
            Status::InternalServerError
        }
    }
}

#[get("/participants/won/<date_as_str>")]
pub async fn get_won_participants_on_day_route(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    _authenticated_user: AuthenticatedUser,
    date_as_str: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    let Some(date) = parse_day(date_as_str) else {
        return Err(Status::BadRequest);
    };

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = get_won_participants_on_day(db_connection_pool, date).await;

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

    let Some(date) = parse_day(date_as_str) else {
        return Err(Status::BadRequest);
    };

    // try to fetch the information and construct the corresponding data structure we want to return
    let maybe_result = get_won_participants_on_day(db_connection_pool, date).await;

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
    picked_for_date: Date,
    user_who_picked: i32,
) -> Result<Vec<Participant>, PickWinnersError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::models::{Participant as DatabaseParticipant, ParticipantPicking};
    use crate::record_action;
    use crate::schema::participants::dsl::{id, participants, won_on};
    use crate::utc_now_without_offset;
    use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl, update};
    use log::error;

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
                    let participants_in_raffle = participants
                        .filter(won_on.is_null())
                        .for_update()
                        .load::<DatabaseParticipant>(connection)?;
                    let winners_on_day = participants
                        .filter(won_on.eq(picked_for_date))
                        .count()
                        .get_result::<i64>(connection)?
                        as usize;
                    if winners_on_day
                        .checked_add(count)
                        .is_none_or(|total| total > MAX_WINNERS_PER_DAY)
                    {
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
                            picking_time: Some(utc_now_without_offset()),
                            picked_by: Some(user_who_picked),
                            present_identifier: None,
                        })
                        .execute(connection)?;

                    for winner in &winners {
                        record_action(
                            connection,
                            Some(user_who_picked),
                            Action::PickedWinner,
                            Some(format!(
                                "The participant with the id {} was marked as won",
                                winner.id
                            )),
                        )?;
                    }

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
    count: &str,
    date: &str,
) -> Result<Json<Vec<Participant>>, Status> {
    use log::{debug, error};

    let Ok(count) = count.parse::<usize>() else {
        return Err(Status::BadRequest);
    };
    if !(1..=MAX_WINNERS_PER_DAY).contains(&count) {
        return Err(Status::BadRequest);
    }

    let Some(picked_for_date) = parse_day(date) else {
        return Err(Status::BadRequest);
    };
    if picked_for_date.year() != OffsetDateTime::now_utc().year()
        || picked_for_date.month() != Month::December
        || picked_for_date.day() > 24
    {
        return Err(Status::BadRequest);
    }

    let winners = match pick_winners(
        db_connection_pool,
        count,
        picked_for_date,
        authenticated_user.user_id,
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

impl From<diesel::result::Error> for RemoveWinnerError {
    fn from(error: diesel::result::Error) -> Self {
        RemoveWinnerError::Database(error)
    }
}

pub async fn mark_participant_as_not_won(
    db_connection_pool: &AdventskalenderDatabaseConnection,
    participant_id: i32,
    user_who_unpicked: i32,
) -> Result<(), RemoveWinnerError> {
    use crate::fairings::BlockingDatabaseError;
    use crate::models::ParticipantPicking;
    use crate::record_action;
    use crate::schema::participants::dsl::{id, participants};
    use diesel::{Connection, ExpressionMethods, QueryDsl, RunQueryDsl, update};
    use log::debug;

    // reset the winning state of the participant and write the audit log entry in one
    // transaction on a blocking thread, so that a failing audit insert rolls the reset back
    let outcome = match db_connection_pool
        .run_blocking(move |db_connection| {
            db_connection.transaction(|connection| {
                let rows_updated = update(participants.filter(id.eq(participant_id)))
                    .set(&ParticipantPicking {
                        won_on: None,
                        picking_time: None,
                        picked_by: None,
                        present_identifier: None,
                    })
                    .execute(connection)?;
                if rows_updated == 0 {
                    return Err(RemoveWinnerError::UnknownParticipant);
                }

                record_action(
                    connection,
                    Some(user_who_unpicked),
                    Action::RemovedWinner,
                    Some(format!(
                        "The participant with the id {participant_id} was marked removed from the list of winners"
                    )),
                )
                .map_err(RemoveWinnerError::Database)
            })
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
