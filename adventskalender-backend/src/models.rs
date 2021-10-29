use chrono::NaiveDate;

#[derive(Queryable)]
pub struct Participant {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub won_on: Option<NaiveDate>,
}
