#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate diesel;
#[cfg(not(debug_assertions))]
#[macro_use]
extern crate diesel_migrations;

use chrono::NaiveDate;
use schema::participants;

pub mod fairings;
pub mod routes;
mod schema;

#[derive(Queryable, Identifiable)]
pub struct Participant {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub won_on: NaiveDate,
}
