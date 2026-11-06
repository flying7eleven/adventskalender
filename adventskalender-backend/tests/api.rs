mod common;

use adventskalender_backend::fairings::BackendConfiguration;
use adventskalender_backend::routes::api_routes;
use common::{TestDatabase, PICKING_USER, PICKING_USER_PASSWORD};
use jsonwebtoken::{DecodingKey, EncodingKey};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use rocket::http::{ContentType, Status};
use rocket::local::blocking::Client;
use rocket::serde::json::{json, Value};
use std::collections::HashSet;

fn client(database: &TestDatabase) -> Client {
    let key_bytes = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
        .unwrap()
        .as_ref()
        .to_vec();
    let public_key = Ed25519KeyPair::from_pkcs8(&key_bytes)
        .unwrap()
        .public_key()
        .as_ref()
        .to_vec();
    let configuration = BackendConfiguration {
        api_host: "http://localhost:5479".to_string(),
        encoding_key: Some(EncodingKey::from_ed_der(&key_bytes)),
        decoding_key: Some(DecodingKey::from_ed_der(&public_key)),
        ed25519_key_bytes: Some(key_bytes),
        healthcheck_project: "unused".to_string(),
        token_audience: HashSet::from(["http://localhost:5173".to_string()]),
    };
    let rocket = rocket::build()
        .manage(configuration)
        .manage(database.new_connection_pool())
        .mount("/v1", api_routes());
    Client::tracked(rocket).unwrap()
}

fn login(client: &Client, username: &str, password: &str) -> Status {
    client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .body(json!({ "username": username, "password": password }).to_string())
        .dispatch()
        .status()
}

fn logged_in_client(database: &TestDatabase) -> Client {
    let client = client(database);
    assert_eq!(
        login(&client, PICKING_USER, PICKING_USER_PASSWORD),
        Status::NoContent
    );
    client
}

#[test]
fn winners_are_picked_with_post_only() {
    let database = TestDatabase::start(3);
    let client = logged_in_client(&database);

    let get_response = client
        .get("/v1/participants/pick/2/for/2026-12-24")
        .dispatch();
    assert_eq!(get_response.status(), Status::NotFound);

    let post_response = client
        .post("/v1/participants/pick/2/for/2026-12-24")
        .dispatch();
    assert_eq!(post_response.status(), Status::Ok);
    let winners: Vec<Value> = post_response.into_json().unwrap();
    assert_eq!(winners.len(), 2);
}

#[test]
fn picking_more_winners_than_participants_left_is_not_found() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);

    let response = client
        .post("/v1/participants/pick/2/for/2026-12-24")
        .dispatch();

    assert_eq!(response.status(), Status::NotFound);
}

#[test]
fn picking_for_an_invalid_date_is_a_bad_request() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);

    let response = client
        .post("/v1/participants/pick/1/for/2026-12-32")
        .dispatch();

    assert_eq!(response.status(), Status::BadRequest);
}

#[test]
fn login_with_an_unknown_user_is_unauthorized() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    assert_eq!(
        login(&client, "unknown", PICKING_USER_PASSWORD),
        Status::Unauthorized
    );
}

#[test]
fn login_reports_a_server_error_if_the_users_cannot_be_read() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    database.execute("ALTER TABLE users RENAME TO unreadable_users");

    assert_eq!(
        login(&client, PICKING_USER, PICKING_USER_PASSWORD),
        Status::InternalServerError
    );
}
