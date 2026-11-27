use crate::schema::{participants, performed_actions};
use diesel::{AsChangeset, Insertable, Queryable};
use time::{Date, PrimitiveDateTime};

#[derive(Queryable, Clone)]
pub struct Participant {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub won_on: Option<Date>,
    pub picked_by: Option<i32>,
    pub picking_time: Option<PrimitiveDateTime>,
    pub present_identifier: Option<String>,
}

#[derive(AsChangeset)]
#[diesel(table_name = participants, treat_none_as_null = true)]
pub struct ParticipantPicking {
    pub won_on: Option<Date>,
    pub picked_by: Option<i32>,
    pub picking_time: Option<PrimitiveDateTime>,
    pub present_identifier: Option<String>,
}

#[derive(Queryable, Clone)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
    pub session_epoch: i32,
}

#[derive(Insertable)]
#[diesel(table_name = performed_actions)]
pub struct NewPerformedAction {
    pub time_of_action: PrimitiveDateTime,
    pub user_id: Option<i32>,
    pub action: String,
    pub description: Option<String>,
}
