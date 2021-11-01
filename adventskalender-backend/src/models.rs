use chrono::NaiveDate;

#[derive(Queryable)]
pub struct Participant {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub won_on: Option<NaiveDate>,
}

#[derive(Queryable, Clone)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: String,
}
