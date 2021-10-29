use crate::fairings::AdventskalenderDatabaseConnection;
use rocket::get;
use rocket::http::Status;
use rocket::serde::json::Json;
use serde::Serialize;

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
