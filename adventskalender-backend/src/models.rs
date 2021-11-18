use crate::schema::{participants, performed_actions};
use chrono::{NaiveDate, NaiveDateTime};

#[derive(Queryable)]
pub struct Participant {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub won_on: Option<NaiveDate>,
    pub picked_by: Option<i32>,
    pub picking_time: Option<NaiveDateTime>,
}

#[derive(AsChangeset)]
#[table_name = "participants"]
pub struct ParticipantPicking {
    pub won_on: Option<NaiveDate>,
    pub picked_by: Option<i32>,
    pub picking_time: Option<NaiveDateTime>,
}

#[derive(Queryable, Clone)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
}

#[derive(AsChangeset)]
#[table_name = "performed_actions"]
pub struct NewPerformedAction {
    pub time_of_action: NaiveDateTime,
    pub user_id: i32,
    pub action: String,
    pub description: Option<String>,
}
