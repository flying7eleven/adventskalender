#[macro_use]
extern crate diesel;
#[cfg(not(debug_assertions))]
#[macro_use]
extern crate diesel_migrations;

pub mod fairings;
pub mod models;
pub mod routes;
mod schema;
