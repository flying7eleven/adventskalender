use crate::schema::participants;
use chrono::{NaiveDate, NaiveDateTime};

#[derive(Queryable)]
pub struct Participant {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub won_on: Option<NaiveDate>,
    pub picked_by: Option<String>,
    pub picking_time: Option<NaiveDateTime>,
}

#[derive(AsChangeset)]
#[table_name = "participants"]
pub struct ParticipantPicking {
    pub won_on: Option<NaiveDate>,
    pub picked_by: Option<String>,
    pub picking_time: Option<NaiveDateTime>,
}

#[derive(Queryable, Clone)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
}
