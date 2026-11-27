mod common;

use adventskalender_backend::build_rocket;
use adventskalender_backend::fairings::BackendConfiguration;
use common::{PICKING_USER_PASSWORD, TestDatabase, date_this_year};
use jsonwebtoken::{DecodingKey, EncodingKey};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use rocket::http::{ContentType, Header, Status};
use rocket::local::blocking::Client;
use rocket::serde::json::{Value, json};
use std::collections::HashSet;

fn fresh_key_bytes() -> Vec<u8> {
    Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
        .unwrap()
        .as_ref()
        .to_vec()
}

fn configuration_with_key_bytes(key_bytes: &[u8], cookie_secure: bool) -> BackendConfiguration {
    BackendConfiguration::from_pkcs8(
        key_bytes,
        "http://localhost:5479".to_string(),
        "http://localhost:5479/.well-known/jwks.json".to_string(),
        None,
        HashSet::from(["http://localhost:5173".to_string()]),
        cookie_secure,
    )
    .unwrap()
}

fn client_with_configuration(
    database: &TestDatabase,
    configuration: BackendConfiguration,
) -> Client {
    let rocket = build_rocket(
        rocket::Config::figment(),
        configuration,
        database.new_connection_pool(),
        adventskalender_backend::cors::Cors::new(["http://localhost:5173"]).unwrap(),
    );
    Client::tracked(rocket).unwrap()
}

fn client_with_key_bytes(database: &TestDatabase, key_bytes: &[u8]) -> Client {
    client_with_configuration(database, configuration_with_key_bytes(key_bytes, false))
}

fn client(database: &TestDatabase) -> Client {
    client_with_key_bytes(database, &fresh_key_bytes())
}

fn login(client: &Client, username: &str, password: &str) -> (Status, Option<Value>) {
    let response = client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .body(json!({ "username": username, "password": password }).to_string())
        .dispatch();
    let status = response.status();
    let body = if status == Status::Ok {
        Some(response.into_json().unwrap())
    } else {
        None
    };
    (status, body)
}

fn logged_in_client(database: &TestDatabase) -> Client {
    logged_in_client_with_key_bytes(database, &fresh_key_bytes())
}

fn logged_in_client_with_key_bytes(database: &TestDatabase, key_bytes: &[u8]) -> Client {
    let client = client_with_key_bytes(database, key_bytes);
    let (status, body) = login(&client, &database.picking_user, PICKING_USER_PASSWORD);
    assert_eq!(status, Status::Ok);
    assert_eq!(
        body.expect("a successful login must return a body")["username"],
        json!(database.picking_user.clone())
    );
    client
}

#[test]
fn a_healthy_backend_reports_its_status_as_ok() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client.get("/v1/health").dispatch();
    assert_eq!(response.status(), Status::Ok);
    let body = response.into_json::<rocket::serde::json::Value>().unwrap();
    assert_eq!(body["database_healthy"], true);
    assert_eq!(body["backend_healthy"], true);
}

#[test]
fn an_unreachable_database_is_reported_as_unavailable() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    database.stop();

    let response = client.get("/v1/health").dispatch();
    assert_eq!(response.status(), Status::ServiceUnavailable);
    let body = response.into_json::<rocket::serde::json::Value>().unwrap();
    assert_eq!(body["database_healthy"], false);
    assert_eq!(body["backend_healthy"], false);
}

#[test]
fn a_preflight_request_from_an_allowed_origin_is_answered_by_the_cors_fairing() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    for uri in ["/v1/auth/token", "/v1/participants/count"] {
        let response = client
            .req(rocket::http::Method::Options, uri)
            .header(Header::new("Origin", "http://localhost:5173"))
            .header(Header::new(
                "Access-Control-Request-Method",
                if uri == "/v1/auth/token" {
                    "POST"
                } else {
                    "GET"
                },
            ))
            .dispatch();
        assert_eq!(response.status(), Status::NoContent, "preflight to {uri}");
        assert_eq!(
            response
                .headers()
                .get_one("Access-Control-Allow-Origin")
                .unwrap_or_default(),
            "http://localhost:5173",
            "preflight to {uri}"
        );
        assert_eq!(
            response
                .headers()
                .get_one("Access-Control-Allow-Credentials")
                .unwrap_or_default(),
            "true",
            "preflight to {uri}"
        );
    }
}

#[test]
fn a_preflight_request_from_a_disallowed_origin_is_rejected() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .req(rocket::http::Method::Options, "/v1/auth/token")
        .header(Header::new("Origin", "http://evil.example"))
        .header(Header::new("Access-Control-Request-Method", "POST"))
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);
    assert_eq!(
        response.headers().get_one("Access-Control-Allow-Origin"),
        None
    );
}

#[test]
fn a_normal_request_from_an_allowed_origin_gets_the_cors_headers() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .get("/v1/health")
        .header(Header::new("Origin", "http://localhost:5173"))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);
    assert_eq!(
        response
            .headers()
            .get_one("Access-Control-Allow-Origin")
            .unwrap_or_default(),
        "http://localhost:5173"
    );
    assert_eq!(
        response
            .headers()
            .get_one("Access-Control-Allow-Credentials")
            .unwrap_or_default(),
        "true"
    );
    assert_eq!(
        response
            .headers()
            .get_one("Access-Control-Expose-Headers")
            .unwrap_or_default(),
        "Retry-After"
    );
    assert!(
        response
            .headers()
            .get("Vary")
            .any(|value| value == "Origin")
    );
}

#[test]
fn a_preflight_request_from_an_allowed_origin_lists_methods_and_echoes_the_requested_headers() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .req(rocket::http::Method::Options, "/v1/auth/password")
        .header(Header::new("Origin", "http://localhost:5173"))
        .header(Header::new("Access-Control-Request-Method", "PUT"))
        .header(Header::new(
            "Access-Control-Request-Headers",
            "content-type, x-custom",
        ))
        .dispatch();
    assert_eq!(response.status(), Status::NoContent);
    let methods: HashSet<String> = response
        .headers()
        .get_one("Access-Control-Allow-Methods")
        .unwrap_or_default()
        .split(',')
        .map(|method| method.trim().to_string())
        .collect();
    assert_eq!(
        methods,
        HashSet::from(["GET", "POST", "PUT", "DELETE"].map(String::from))
    );
    let headers: HashSet<String> = response
        .headers()
        .get_one("Access-Control-Allow-Headers")
        .unwrap_or_default()
        .split(',')
        .map(|header| header.trim().to_lowercase())
        .collect();
    assert_eq!(
        headers,
        HashSet::from(["content-type", "x-custom"].map(String::from))
    );
    assert!(
        response
            .headers()
            .get("Vary")
            .any(|value| value == "Origin")
    );
    assert_eq!(response.into_string().unwrap_or_default(), "");
}

#[test]
fn a_preflight_request_from_an_allowed_origin_for_a_disallowed_method_is_rejected() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .req(rocket::http::Method::Options, "/v1/auth/token")
        .header(Header::new("Origin", "http://localhost:5173"))
        .header(Header::new("Access-Control-Request-Method", "PATCH"))
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);
    assert_eq!(
        response.headers().get_one("Access-Control-Allow-Origin"),
        None
    );
}

#[test]
fn a_normal_request_from_a_disallowed_origin_is_rejected_before_the_route_runs() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .header(Header::new("Origin", "http://evil.example"))
        .body(
            json!({ "username": database.picking_user, "password": PICKING_USER_PASSWORD })
                .to_string(),
        )
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);
    assert_eq!(
        response.headers().get_one("Access-Control-Allow-Origin"),
        None
    );
    assert_eq!(response.headers().get_one("Set-Cookie"), None);
    assert_eq!(client.cookies().iter().count(), 0);
}

#[test]
fn a_request_without_an_origin_passes_without_cors_headers() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let (status, _) = login(&client, &database.picking_user, PICKING_USER_PASSWORD);
    assert_eq!(status, Status::Ok);

    let response = client.get("/v1/health").dispatch();
    assert_eq!(response.status(), Status::Ok);
    assert_eq!(
        response.headers().get_one("Access-Control-Allow-Origin"),
        None
    );
}

#[test]
fn winners_are_picked_with_post_only() {
    let database = TestDatabase::start(3);
    let client = logged_in_client(&database);

    let get_response = client
        .get(format!(
            "/v1/participants/pick/2/for/{}",
            date_this_year(12, 24)
        ))
        .dispatch();
    assert_eq!(get_response.status(), Status::NotFound);

    let post_response = client
        .post(format!(
            "/v1/participants/pick/2/for/{}",
            date_this_year(12, 24)
        ))
        .dispatch();
    assert_eq!(post_response.status(), Status::Ok);
    let winners: Vec<Value> = post_response.into_json().unwrap();
    assert_eq!(winners.len(), 2);
}

#[test]
fn the_participant_count_reflects_the_won_participants() {
    let database = TestDatabase::start(5);
    let client = logged_in_client(&database);

    let response = client.get("/v1/participants/count").dispatch();
    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    assert_eq!(body["number_of_participants"], 5);
    assert_eq!(body["number_of_participants_won"], 0);
    assert_eq!(body["number_of_participants_still_in_raffle"], 5);

    let response = client
        .post(format!(
            "/v1/participants/pick/2/for/{}",
            date_this_year(12, 24)
        ))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);

    let response = client.get("/v1/participants/count").dispatch();
    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    assert_eq!(body["number_of_participants"], 5);
    assert_eq!(body["number_of_participants_won"], 2);
    assert_eq!(body["number_of_participants_still_in_raffle"], 3);
}

#[test]
fn picking_more_winners_than_participants_left_is_not_found() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);

    let response = client
        .post(format!(
            "/v1/participants/pick/2/for/{}",
            date_this_year(12, 24)
        ))
        .dispatch();

    assert_eq!(response.status(), Status::NotFound);
}

#[test]
fn picking_for_an_invalid_date_is_a_bad_request() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);

    let response = client
        .post(format!(
            "/v1/participants/pick/1/for/{}",
            date_this_year(12, 32)
        ))
        .dispatch();

    assert_eq!(response.status(), Status::BadRequest);
}

#[test]
fn picking_more_winners_than_the_day_allows_is_a_conflict() {
    let database = TestDatabase::start(7);
    let client = logged_in_client(&database);
    pick_winners(&client, 4, &date_this_year(12, 24));

    let response = client
        .post(format!(
            "/v1/participants/pick/2/for/{}",
            date_this_year(12, 24)
        ))
        .dispatch();

    assert_eq!(response.status(), Status::Conflict);
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        4
    );
}

fn select_package(client: &Client, participant_id: i32, package: &str) -> Status {
    client
        .put(format!("/v1/participants/{participant_id}"))
        .header(ContentType::JSON)
        .body(json!({ "package": package }).to_string())
        .dispatch()
        .status()
}

fn pick_winners(client: &Client, count: usize, date: &str) -> Vec<i32> {
    client
        .post(format!("/v1/participants/pick/{count}/for/{date}"))
        .dispatch()
        .into_json::<Vec<Value>>()
        .unwrap()
        .iter()
        .map(|winner| winner["id"].as_i64().unwrap() as i32)
        .collect()
}

#[test]
fn assigning_a_package_stores_it_and_clearing_it_stores_null() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let winner_ids = pick_winners(&client, 2, &date_this_year(12, 24));

    assert_eq!(
        select_package(&client, winner_ids[0], "A"),
        Status::NoContent
    );
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants WHERE id = {} AND present_identifier = 'A'",
            winner_ids[0]
        )),
        1
    );

    assert_eq!(
        select_package(&client, winner_ids[0], ""),
        Status::NoContent
    );
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants WHERE id = {} AND present_identifier IS NULL",
            winner_ids[0]
        )),
        1
    );

    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'package_changed' AND description LIKE '%was removed%'"
        ),
        1,
        "clearing the package must be audited as a removal, not as a change to an empty package"
    );
}

#[test]
fn the_same_package_can_only_be_assigned_once_per_day() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let winner_ids = pick_winners(&client, 2, &date_this_year(12, 24));

    assert_eq!(
        select_package(&client, winner_ids[0], "A"),
        Status::NoContent
    );
    assert_eq!(
        select_package(&client, winner_ids[1], "A"),
        Status::Conflict
    );
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants WHERE id = {} AND present_identifier IS NULL",
            winner_ids[1]
        )),
        1
    );
}

#[test]
fn the_same_package_can_be_assigned_on_different_days() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let first_day_winner = pick_winners(&client, 1, &date_this_year(12, 24))[0];
    let second_day_winner = pick_winners(&client, 1, &date_this_year(12, 23))[0];

    assert_eq!(
        select_package(&client, first_day_winner, "A"),
        Status::NoContent
    );
    assert_eq!(
        select_package(&client, second_day_winner, "A"),
        Status::NoContent
    );
}

#[test]
fn only_a_single_uppercase_letter_is_a_valid_package() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);
    let winner_id = pick_winners(&client, 1, &date_this_year(12, 24))[0];

    assert_eq!(
        select_package(&client, winner_id, "AB"),
        Status::UnprocessableEntity
    );
    assert_eq!(
        select_package(&client, winner_id, "a"),
        Status::UnprocessableEntity
    );
    assert_eq!(
        select_package(&client, winner_id, "1"),
        Status::UnprocessableEntity
    );
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants WHERE id = {winner_id} AND present_identifier IS NULL"
        )),
        1
    );
}

#[test]
fn clearing_both_packages_of_one_day_is_possible_after_an_assignment() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let winner_ids = pick_winners(&client, 2, &date_this_year(12, 24));

    assert_eq!(
        select_package(&client, winner_ids[0], "A"),
        Status::NoContent
    );
    assert_eq!(
        select_package(&client, winner_ids[1], "B"),
        Status::NoContent
    );
    assert_eq!(
        select_package(&client, winner_ids[0], ""),
        Status::NoContent
    );
    assert_eq!(
        select_package(&client, winner_ids[1], ""),
        Status::NoContent
    );
}

#[test]
fn login_with_an_unknown_user_is_unauthorized() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    assert_eq!(
        login(&client, "unknown", PICKING_USER_PASSWORD).0,
        Status::Unauthorized
    );
}

#[test]
fn rate_limited_logins_carry_a_retry_after_header() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let mut last_response = None;
    for _ in 0..6 {
        let response = client
            .post("/v1/auth/token")
            .header(ContentType::JSON)
            .header(Header::new("X-Real-IP", "192.0.2.10"))
            .body(json!({ "username": &database.picking_user, "password": "wrong" }).to_string())
            .dispatch();
        last_response = Some(response);
    }

    let response = last_response.unwrap();
    assert_eq!(response.status(), Status::TooManyRequests);
    let retry_after = response
        .headers()
        .get_one("Retry-After")
        .expect("the response must carry a Retry-After header");
    assert!(
        retry_after.parse::<u64>().is_ok(),
        "Retry-After must be an integer number of seconds, got {retry_after}"
    );
}

#[test]
fn rate_limits_are_keyed_by_the_real_client_ip() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    for attempt in 0..5 {
        let response = client
            .post("/v1/auth/token")
            .header(ContentType::JSON)
            .header(Header::new("X-Real-IP", "192.0.2.11"))
            .body(
                json!({ "username": format!("rate-limit-ip-user-{attempt}"), "password": "wrong" })
                    .to_string(),
            )
            .dispatch();
        assert_eq!(response.status(), Status::Unauthorized);
    }

    let response = client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .header(Header::new("X-Real-IP", "192.0.2.12"))
        .body(json!({ "username": "rate-limit-ip-user-other", "password": "wrong" }).to_string())
        .dispatch();
    assert_eq!(response.status(), Status::Unauthorized);

    let response = client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .header(Header::new("X-Real-IP", "192.0.2.11"))
        .body(json!({ "username": "rate-limit-ip-user-final", "password": "wrong" }).to_string())
        .dispatch();
    assert_eq!(response.status(), Status::TooManyRequests);
}

#[test]
fn login_reports_a_server_error_if_the_users_cannot_be_read() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    database.execute("ALTER TABLE users RENAME TO unreadable_users");

    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::InternalServerError
    );
}

#[test]
fn listing_winners_reports_a_server_error_if_the_participants_cannot_be_read() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);
    database.execute("ALTER TABLE participants RENAME TO unreadable_participants");

    let response = client.get("/v1/participants/won").dispatch();

    assert_eq!(response.status(), Status::InternalServerError);
}

fn change_password(client: &Client, current: &str, first_time: &str, second_time: &str) -> Status {
    client
        .put("/v1/auth/password")
        .header(ContentType::JSON)
        .body(
            json!({
                "current_password": current,
                "first_time": first_time,
                "second_time": second_time
            })
            .to_string(),
        )
        .dispatch()
        .status()
}

fn change_password_reason(
    client: &Client,
    current: &str,
    first_time: &str,
    second_time: &str,
) -> (Status, Option<ContentType>, Option<Value>) {
    let response = client
        .put("/v1/auth/password")
        .header(ContentType::JSON)
        .body(
            json!({
                "current_password": current,
                "first_time": first_time,
                "second_time": second_time
            })
            .to_string(),
        )
        .dispatch();
    let status = response.status();
    let content_type = response.content_type();
    let body = response.into_json::<Value>();
    (status, content_type, body)
}

const NEW_PASSWORD: &str = "Tr0ub4dor&3-horse-Battery";

#[test]
fn a_changed_password_replaces_the_old_one() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    assert_eq!(
        change_password(&client, PICKING_USER_PASSWORD, NEW_PASSWORD, NEW_PASSWORD),
        Status::NoContent
    );
    let (status, body) = login(&client, &database.picking_user, NEW_PASSWORD);
    assert_eq!(status, Status::Ok);
    assert_eq!(
        body.expect("a successful login must return a body")["username"],
        json!(database.picking_user.clone())
    );
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Unauthorized
    );
}

#[test]
fn changing_the_password_with_a_wrong_current_password_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, content_type, body) = change_password_reason(
        &client,
        "definitely-not-the-password",
        NEW_PASSWORD,
        NEW_PASSWORD,
    );
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(content_type, Some(ContentType::JSON));
    assert_eq!(body.unwrap()["reason"], json!("wrong_current_password"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Ok
    );
}

#[test]
fn changing_the_password_with_differing_repetitions_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, _, body) = change_password_reason(
        &client,
        PICKING_USER_PASSWORD,
        NEW_PASSWORD,
        "something-else",
    );
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("passwords_do_not_match"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Ok
    );
}

#[test]
fn changing_the_password_to_a_too_short_one_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, _, body) =
        change_password_reason(&client, PICKING_USER_PASSWORD, "Sh0r!t", "Sh0r!t");
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_short"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Ok
    );
}

#[test]
fn changing_the_password_to_a_too_weak_one_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let weak_password = "aaaaaaaa";
    let (status, _, body) =
        change_password_reason(&client, PICKING_USER_PASSWORD, weak_password, weak_password);
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_weak"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Ok
    );
}

#[test]
fn changing_the_password_of_a_deleted_user_is_forbidden() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);
    database.execute("DELETE FROM performed_actions");
    database.execute("DELETE FROM users");

    assert_eq!(
        change_password(&client, PICKING_USER_PASSWORD, NEW_PASSWORD, NEW_PASSWORD),
        Status::Forbidden
    );
}

#[test]
fn the_advertised_json_web_key_set_is_served() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    let configuration: Value = client
        .get("/.well-known/openid-configuration")
        .dispatch()
        .into_json()
        .unwrap();
    assert_eq!(
        configuration["id_token_signing_alg_values_supported"],
        json!(["EdDSA"])
    );
    let jwks_path = url::Url::parse(configuration["jwks_uri"].as_str().unwrap())
        .unwrap()
        .path()
        .to_string();

    let response = client.get(jwks_path).dispatch();

    assert_eq!(response.status(), Status::Ok);
    let key_set: Value = response.into_json().unwrap();
    assert_eq!(key_set["keys"].as_array().unwrap().len(), 1);
}

#[test]
fn the_openid_configuration_advertises_only_the_supported_fields() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let configuration: Value = client
        .get("/.well-known/openid-configuration")
        .dispatch()
        .into_json()
        .unwrap();

    assert_eq!(configuration.as_object().unwrap().len(), 3);
    assert_eq!(configuration["issuer"], json!("http://localhost:5479"));
    assert_eq!(
        configuration["jwks_uri"],
        json!("http://localhost:5479/.well-known/jwks.json")
    );
    assert_eq!(
        configuration["id_token_signing_alg_values_supported"],
        json!(["EdDSA"])
    );
}

#[test]
fn issued_tokens_carry_the_key_id_and_verify_with_the_key_the_jwks_advertises() {
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = logged_in
        .cookies()
        .get("auth_token")
        .expect("a login must set the auth_token cookie")
        .value()
        .to_string();

    let key_set: Value = logged_in
        .get("/.well-known/jwks.json")
        .dispatch()
        .into_json()
        .unwrap();
    let advertised_key = &key_set["keys"][0];

    assert_eq!(
        jsonwebtoken::decode_header(&token).unwrap().kid.as_deref(),
        advertised_key["kid"].as_str()
    );
    let advertised_x = advertised_key["x"].as_str().unwrap();
    assert_eq!(
        URL_SAFE_NO_PAD.decode(advertised_x).unwrap(),
        Ed25519KeyPair::from_pkcs8(&key_bytes)
            .unwrap()
            .public_key()
            .as_ref()
    );
    let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::EdDSA);
    validation.set_audience(&["http://localhost:5173"]);
    validation.set_issuer(&["http://localhost:5479"]);
    jsonwebtoken::decode::<Value>(
        &token,
        &DecodingKey::from_ed_components(advertised_x).unwrap(),
        &validation,
    )
    .expect("the token must verify with the advertised key");
}

fn assert_security_headers(response: &rocket::local::blocking::LocalResponse<'_>) {
    let headers = response.headers();
    assert_eq!(headers.get_one("X-Content-Type-Options"), Some("nosniff"));
    assert_eq!(headers.get_one("X-Frame-Options"), Some("DENY"));
    assert_eq!(
        headers.get_one("Referrer-Policy"),
        Some("strict-origin-when-cross-origin")
    );
    assert!(headers.get_one("Content-Security-Policy").is_some());
    assert!(headers.get_one("Permissions-Policy").is_some());
    assert_eq!(headers.get_one("X-XSS-Protection"), Some("0"));
    let expected_hsts = if cfg!(debug_assertions) {
        None
    } else {
        Some("max-age=31536000")
    };
    assert_eq!(headers.get_one("Strict-Transport-Security"), expected_hsts);
}

#[test]
fn successful_and_rejected_responses_carry_the_security_headers() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client.get("/.well-known/openid-configuration").dispatch();
    assert_eq!(response.status(), Status::Ok);
    assert_security_headers(&response);

    let response = client.get("/v1/auth/me").dispatch();
    assert_eq!(response.status(), Status::Forbidden);
    assert_security_headers(&response);
}

fn auth_cookie_set_by(
    response: &rocket::local::blocking::LocalResponse<'_>,
) -> rocket::http::Cookie<'static> {
    response
        .headers()
        .get("Set-Cookie")
        .map(|value| rocket::http::Cookie::parse(value.to_string()).unwrap())
        .find(|cookie| cookie.name() == "auth_token")
        .expect("the response must set the auth_token cookie")
}

fn login_response<'c>(
    client: &'c Client,
    database: &TestDatabase,
) -> rocket::local::blocking::LocalResponse<'c> {
    client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .body(
            json!({ "username": database.picking_user, "password": PICKING_USER_PASSWORD })
                .to_string(),
        )
        .dispatch()
}

#[test]
fn the_session_cookie_is_secure_when_configured_on_login_and_refresh() {
    let database = TestDatabase::start(0);
    let client = client_with_configuration(
        &database,
        configuration_with_key_bytes(&fresh_key_bytes(), true),
    );

    let response = login_response(&client, &database);
    assert_eq!(response.status(), Status::Ok);
    let login_cookie = auth_cookie_set_by(&response);
    assert_eq!(login_cookie.secure(), Some(true));
    assert_eq!(login_cookie.http_only(), Some(true));
    assert_eq!(
        login_cookie.same_site(),
        Some(rocket::http::SameSite::Strict)
    );

    let response = client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", login_cookie.value().to_string()))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);
    assert_eq!(auth_cookie_set_by(&response).secure(), Some(true));
}

#[test]
fn the_session_cookie_is_not_secure_when_disabled_on_login_and_refresh() {
    let database = TestDatabase::start(0);
    let client = client_with_configuration(
        &database,
        configuration_with_key_bytes(&fresh_key_bytes(), false),
    );

    let response = login_response(&client, &database);
    assert_eq!(response.status(), Status::Ok);
    let login_cookie = auth_cookie_set_by(&response);
    assert_ne!(login_cookie.secure(), Some(true));

    let response = client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", login_cookie.value().to_string()))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);
    assert_ne!(auth_cookie_set_by(&response).secure(), Some(true));
}

#[test]
fn the_audit_event_count_requires_an_authenticated_user() {
    let database = TestDatabase::start(0);
    let unauthenticated_client = client(&database);
    let authenticated_client = logged_in_client(&database);

    let response = unauthenticated_client.get("/v1/audit/count").dispatch();
    assert_eq!(response.status(), Status::Forbidden);

    let response = authenticated_client.get("/v1/audit/count").dispatch();
    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    assert!(body["count"].as_i64().unwrap() >= 1);
}

#[test]
fn logging_out_clears_the_session_cookie() {
    let database = TestDatabase::start(0);
    let logged_in = logged_in_client(&database);
    assert!(
        logged_in.cookies().get("auth_token").is_some(),
        "a login must set the auth_token cookie"
    );

    let response = logged_in.post("/v1/auth/logout").dispatch();

    assert_eq!(response.status(), Status::NoContent);
    assert!(
        logged_in.cookies().get("auth_token").is_none(),
        "the logout must remove the auth_token cookie"
    );
    assert_eq!(
        logged_in.get("/v1/auth/me").dispatch().status(),
        Status::Forbidden
    );
}

#[test]
fn picking_without_logging_in_is_forbidden_and_marks_nobody() {
    let database = TestDatabase::start(1);
    let client = client(&database);

    let response = client
        .post(format!(
            "/v1/participants/pick/1/for/{}",
            date_this_year(12, 24)
        ))
        .dispatch();

    assert_eq!(response.status(), Status::Forbidden);
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn logins_are_audited_with_the_user_only_if_they_succeed() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);
    login(&client, "unknown", PICKING_USER_PASSWORD);

    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM performed_actions a JOIN users u ON a.user_id = u.id \
             WHERE a.action = 'successful_login' AND u.username = '{}'",
            database.picking_user
        )),
        1
    );
    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'failed_login' AND user_id IS NULL"
        ),
        1
    );
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[test]
fn me_reports_the_username_and_the_remaining_token_lifetime() {
    let database = TestDatabase::start(0);
    let logged_in = logged_in_client(&database);

    let response = logged_in.get("/v1/auth/me").dispatch();

    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    assert_eq!(body["username"], json!(database.picking_user.clone()));
    let expires_in = body["expires_in"]
        .as_u64()
        .expect("expires_in must be a number");
    assert!(
        expires_in <= 3601 && expires_in > 3590,
        "the token is valid for roughly one more hour, got {expires_in}"
    );
}

#[test]
fn removing_a_winner_over_http_resets_the_participant_and_logs_it() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);
    let winner_id = pick_winners(&client, 1, &date_this_year(12, 24))[0];

    let response = client
        .delete(format!("/v1/participants/won/{winner_id}"))
        .dispatch();

    assert_eq!(response.status(), Status::NoContent);
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants \
             WHERE id = {winner_id} AND won_on IS NULL AND picked_by IS NULL AND picking_time IS NULL"
        )),
        1
    );
    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'removed_winner' AND user_id IS NOT NULL"
        ),
        1
    );
}

#[test]
fn removing_an_unknown_winner_over_http_is_not_found() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);

    let response = client.delete("/v1/participants/won/4711").dispatch();

    assert_eq!(response.status(), Status::NotFound);
    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions WHERE action = 'removed_winner'"
        ),
        0
    );
}

#[test]
fn refreshing_a_session_after_the_absolute_session_lifetime_is_forbidden() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let client = client_with_key_bytes(&database, &key_bytes);
    let encoding_key = EncodingKey::from_ed_der(&key_bytes);

    // craft a token whose original login lies one second past the absolute session lifetime
    let auth_time =
        unix_now() - (adventskalender_backend::session_lifetime_in_seconds() as u64 + 1);
    let (token, _) = adventskalender_backend::get_token_for_user_with_auth_time(
        &database.picking_user,
        database.picking_user_id,
        0,
        HashSet::from(["http://localhost:5173".to_string()]),
        "http://localhost:5479".to_string(),
        &encoding_key,
        auth_time as usize,
    )
    .expect("token creation must succeed");

    let response = client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", token))
        .dispatch();

    assert_eq!(response.status(), Status::Forbidden);
    assert_removes_the_auth_cookie(&response);
}

#[test]
fn refreshing_the_session_of_a_deleted_user_is_forbidden() {
    let database = TestDatabase::start(0);
    let logged_in = logged_in_client(&database);
    database.execute("DELETE FROM performed_actions");
    database.execute("DELETE FROM users");

    let response = logged_in.post("/v1/auth/refresh").dispatch();

    assert_eq!(response.status(), Status::Forbidden);
    assert_removes_the_auth_cookie(&response);
}

#[test]
fn too_many_wrong_current_passwords_are_rate_limited() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    for _ in 0..5 {
        assert_eq!(
            change_password(
                &client,
                "wrong-current-password",
                NEW_PASSWORD,
                NEW_PASSWORD
            ),
            Status::UnprocessableEntity
        );
    }

    let response = client
        .put("/v1/auth/password")
        .header(ContentType::JSON)
        .body(
            json!({
                "current_password": "wrong-current-password",
                "first_time": NEW_PASSWORD,
                "second_time": NEW_PASSWORD
            })
            .to_string(),
        )
        .dispatch();
    assert_eq!(response.status(), Status::TooManyRequests);
    assert!(
        response
            .headers()
            .get_one("Retry-After")
            .expect("a Retry-After header must be set")
            .parse::<u64>()
            .expect("Retry-After must be a number")
            > 0
    );

    let (status, content_type, body) = change_password_reason(
        &client,
        "wrong-current-password",
        NEW_PASSWORD,
        NEW_PASSWORD,
    );
    assert_eq!(status, Status::TooManyRequests);
    assert_eq!(content_type, Some(ContentType::JSON));
    assert_eq!(
        body.expect("a rate limited password change must explain itself")["reason"],
        json!("too_many_requests")
    );

    // the rate limit also blocks a request with the correct current password
    assert_eq!(
        change_password(&client, PICKING_USER_PASSWORD, NEW_PASSWORD, NEW_PASSWORD),
        Status::TooManyRequests
    );
}

#[test]
fn a_rate_limited_password_change_exposes_the_retry_after_header_to_cross_origin_clients() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    for _ in 0..5 {
        change_password(
            &client,
            "wrong-current-password",
            NEW_PASSWORD,
            NEW_PASSWORD,
        );
    }

    let response = client
        .put("/v1/auth/password")
        .header(ContentType::JSON)
        .header(Header::new("Origin", "http://localhost:5173"))
        .body(
            json!({
                "current_password": "wrong-current-password",
                "first_time": NEW_PASSWORD,
                "second_time": NEW_PASSWORD
            })
            .to_string(),
        )
        .dispatch();
    assert_eq!(response.status(), Status::TooManyRequests);
    assert!(response.headers().get_one("Retry-After").is_some());
    let exposed_headers = response
        .headers()
        .get_one("Access-Control-Expose-Headers")
        .expect("Access-Control-Expose-Headers must be set for cross-origin clients");
    assert!(
        exposed_headers
            .split(',')
            .any(|header| header.trim() == "Retry-After"),
        "Retry-After must be exposed, got: {exposed_headers}"
    );
}

#[test]
fn only_the_packages_the_ui_offers_are_valid() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);
    let winner_id = pick_winners(&client, 1, &date_this_year(12, 24))[0];

    assert_eq!(
        select_package(&client, winner_id, "F"),
        Status::UnprocessableEntity
    );
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants WHERE id = {winner_id} AND present_identifier IS NULL"
        )),
        1
    );
}

#[test]
fn a_password_shorter_than_eight_characters_is_rejected_even_if_it_has_eight_bytes() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, _, body) = change_password_reason(&client, PICKING_USER_PASSWORD, "äöüä", "äöüä");
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_short"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Ok
    );
}

#[test]
fn refreshing_a_session_reissues_the_cookie_and_returns_the_new_remaining_lifetime() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);

    let response = logged_in.post("/v1/auth/refresh").dispatch();

    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    assert_eq!(body["username"], json!(database.picking_user.clone()));
    let expires_in = body["expires_in"]
        .as_u64()
        .expect("expires_in must be a number");
    assert!(
        expires_in <= 3601 && expires_in > 3590,
        "the refreshed token is valid for roughly one more hour, got {expires_in}"
    );

    let new_token = logged_in
        .cookies()
        .get("auth_token")
        .expect("a fresh auth_token cookie must be set")
        .value()
        .to_string();
    let cookieless_client = client_with_key_bytes(&database, &key_bytes);
    let response = cookieless_client
        .get("/v1/auth/me")
        .cookie(("auth_token", new_token))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    assert_eq!(body["username"], json!(database.picking_user.clone()));
    let carried_expires_in = body["expires_in"].as_u64().unwrap();
    assert!(
        carried_expires_in <= 3601 && carried_expires_in > 3590,
        "the cookie carries the refreshed token, got {carried_expires_in}"
    );
}

#[derive(serde::Deserialize)]
struct Claims {
    auth_time: u64,
    exp: u64,
}

fn decoding_key_of(key_bytes: &[u8]) -> DecodingKey {
    DecodingKey::from_ed_der(
        Ed25519KeyPair::from_pkcs8(key_bytes)
            .unwrap()
            .public_key()
            .as_ref(),
    )
}

#[test]
fn a_refresh_near_the_session_cap_returns_a_short_lived_token_which_keeps_the_original_auth_time() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let client = client_with_key_bytes(&database, &key_bytes);
    let encoding_key = EncodingKey::from_ed_der(&key_bytes);
    let audience = HashSet::from(["http://localhost:5173".to_string()]);
    let issuer = "http://localhost:5479".to_string();

    let now = unix_now();
    let auth_time = now - (adventskalender_backend::session_lifetime_in_seconds() as u64 - 60);
    let (token, _) = adventskalender_backend::get_token_for_user_with_auth_time(
        &database.picking_user,
        database.picking_user_id,
        0,
        audience.clone(),
        issuer.to_string(),
        &encoding_key,
        auth_time as usize,
    )
    .expect("token creation must succeed");

    let response = client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", token))
        .dispatch();

    assert_eq!(response.status(), Status::Ok);
    let body: Value = response.into_json().unwrap();
    let expires_in = body["expires_in"]
        .as_u64()
        .expect("expires_in must be a number");
    assert!(
        expires_in <= 61,
        "the refreshed token must not outlive the session cap, got {expires_in}"
    );

    let new_token = client
        .cookies()
        .get("auth_token")
        .expect("a fresh auth_token cookie must be set")
        .value()
        .to_string();
    let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::EdDSA);
    validation.leeway = 5;
    validation.aud = Some(audience.clone());
    validation.iss = Some(HashSet::from([issuer.to_string()]));
    let claims =
        jsonwebtoken::decode::<Claims>(&new_token, &decoding_key_of(&key_bytes), &validation)
            .expect("the refreshed token must be decodable")
            .claims;
    assert_eq!(claims.auth_time, auth_time);
    assert_eq!(
        claims.exp,
        auth_time + adventskalender_backend::session_lifetime_in_seconds() as u64,
        "the refreshed token must expire exactly at the session cap"
    );

    let cookies = client.cookies();
    let cookie = cookies
        .get("auth_token")
        .expect("a fresh auth_token cookie must be set");
    let cookie_expires_at = match cookie.expires() {
        Some(rocket::http::private::cookie::Expiration::DateTime(datetime)) => {
            datetime.unix_timestamp() as u64
        }
        _ => panic!("the auth_token cookie must carry an expiry"),
    };
    assert_eq!(
        cookie_expires_at, claims.exp,
        "the cookie must expire together with the capped token"
    );

    let (token, _) = adventskalender_backend::get_token_for_user_with_auth_time(
        &database.picking_user,
        database.picking_user_id,
        0,
        audience,
        "http://localhost:5479".to_string(),
        &encoding_key,
        now as usize - adventskalender_backend::session_lifetime_in_seconds(),
    )
    .expect("token creation must succeed");
    let response = client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", token))
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);
}

#[test]
fn a_login_cookie_expires_together_with_its_token() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD).0,
        Status::Ok
    );

    let cookies = client.cookies();
    let cookie = cookies
        .get("auth_token")
        .expect("a login must set the auth_token cookie");
    let now = unix_now();
    let expires_at = match cookie.expires() {
        Some(rocket::http::private::cookie::Expiration::DateTime(datetime)) => {
            datetime.unix_timestamp() as u64
        }
        Some(rocket::http::private::cookie::Expiration::Session) => {
            panic!("the auth_token cookie must carry an expiry")
        }
        None => panic!("the auth_token cookie must carry an expiry"),
    };
    assert!(
        expires_at > now && expires_at <= now + 3602,
        "the cookie must expire together with the roughly one hour token, got {expires_at} at {now}"
    );
}

fn pick_status(client: &Client, count: &str, date: &str) -> Status {
    client
        .post(format!("/v1/participants/pick/{count}/for/{date}"))
        .dispatch()
        .status()
}

fn number_of_winners(database: &TestDatabase) -> i64 {
    database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL")
}

#[test]
fn picking_an_invalid_number_of_winners_is_a_bad_request_and_marks_nobody() {
    let database = TestDatabase::start(7);
    let client = logged_in_client(&database);
    let christmas_eve = date_this_year(12, 24);

    for count in [
        "0".to_string(),
        (adventskalender_backend::routes::MAX_WINNERS_PER_DAY + 1).to_string(),
        usize::MAX.to_string(),
        "99999999999999999999999999".to_string(),
        "-1".to_string(),
        "two".to_string(),
    ] {
        assert_eq!(
            pick_status(&client, &count, &christmas_eve),
            Status::BadRequest,
            "count {count}"
        );
    }
    assert_eq!(number_of_winners(&database), 0);
}

#[test]
fn picking_for_a_date_outside_the_advent_days_of_this_year_is_a_bad_request() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let year = common::current_year();

    for date in [
        date_this_year(11, 24),
        date_this_year(12, 25),
        date_this_year(12, 31),
        format!("{}-12-24", year - 1),
        format!("{}-12-24", year + 1),
    ] {
        assert_eq!(
            pick_status(&client, "1", &date),
            Status::BadRequest,
            "date {date}"
        );
    }
    assert_eq!(number_of_winners(&database), 0);
}

#[test]
fn picking_on_the_first_and_the_last_advent_day_succeeds() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);

    assert_eq!(
        pick_status(&client, "1", &date_this_year(12, 1)),
        Status::Ok
    );
    assert_eq!(
        pick_status(&client, "1", &date_this_year(12, 24)),
        Status::Ok
    );
    assert_eq!(number_of_winners(&database), 2);
}

#[test]
fn picking_the_maximum_number_of_winners_succeeds() {
    let max = adventskalender_backend::routes::MAX_WINNERS_PER_DAY;
    let database = TestDatabase::start(max as i32);
    let client = logged_in_client(&database);

    assert_eq!(
        pick_status(&client, &max.to_string(), &date_this_year(12, 24)),
        Status::Ok
    );
    assert_eq!(number_of_winners(&database), max as i64);
}

#[test]
fn selecting_a_package_for_a_participant_who_did_not_win_is_a_conflict() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);
    let participant_id =
        database.count("SELECT CAST(MIN(id) AS BIGINT) AS count FROM participants") as i32;

    assert_eq!(
        select_package(&client, participant_id, "A"),
        Status::Conflict
    );
    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM participants WHERE present_identifier IS NOT NULL"
        ),
        0
    );
    assert_eq!(
        database
            .count("SELECT COUNT(*) AS count FROM performed_actions WHERE action LIKE 'package_%'"),
        0
    );
}

#[test]
fn selecting_a_package_for_an_unknown_participant_is_not_found() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);

    assert_eq!(select_package(&client, 4711, "A"), Status::NotFound);
}

#[test]
fn selecting_and_changing_a_package_of_a_winner_is_audited_with_the_user() {
    let database = TestDatabase::start(1);
    let client = logged_in_client(&database);
    let winner_id = pick_winners(&client, 1, &date_this_year(12, 24))[0];

    assert_eq!(select_package(&client, winner_id, "A"), Status::NoContent);
    assert_eq!(select_package(&client, winner_id, "B"), Status::NoContent);

    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'package_selected' AND user_id IS NOT NULL"
        ),
        1
    );
    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'package_changed' AND user_id IS NOT NULL AND description LIKE '%previous package was A%'"
        ),
        1
    );
}

#[test]
fn picking_winners_over_http_logs_one_audit_entry_per_winner() {
    let database = TestDatabase::start(3);
    let client = logged_in_client(&database);

    pick_winners(&client, 3, &date_this_year(12, 24));

    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'picked_winner' AND user_id IS NOT NULL"
        ),
        3
    );
}

fn session_token_of(client: &Client) -> String {
    client
        .cookies()
        .get("auth_token")
        .expect("the client must hold an auth_token cookie")
        .value()
        .to_string()
}

fn me_status_with_token(client: &Client, token: &str) -> Status {
    client
        .get("/v1/auth/me")
        .cookie(("auth_token", token.to_string()))
        .dispatch()
        .status()
}

#[test]
fn a_token_replayed_after_logout_is_rejected() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = session_token_of(&logged_in);
    let replaying_client = client_with_key_bytes(&database, &key_bytes);
    assert_eq!(me_status_with_token(&replaying_client, &token), Status::Ok);

    assert_eq!(
        logged_in.post("/v1/auth/logout").dispatch().status(),
        Status::NoContent
    );

    assert_eq!(
        me_status_with_token(&replaying_client, &token),
        Status::Forbidden
    );
}

#[test]
fn refreshing_with_a_token_replayed_after_logout_is_rejected() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = session_token_of(&logged_in);
    logged_in.post("/v1/auth/logout").dispatch();

    let replaying_client = client_with_key_bytes(&database, &key_bytes);
    let response = replaying_client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", token))
        .dispatch();

    assert_eq!(response.status(), Status::Forbidden);
    assert_removes_the_auth_cookie(&response);
}

#[test]
fn a_token_of_a_deleted_user_is_rejected_after_the_username_was_recreated() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = session_token_of(&logged_in);
    database.execute("DELETE FROM performed_actions");
    database.execute("DELETE FROM users");
    database.execute(&format!(
        "INSERT INTO users (username, password_hash) VALUES ('{}', '{}')",
        database.picking_user,
        bcrypt::hash(PICKING_USER_PASSWORD, 4).unwrap()
    ));

    let replaying_client = client_with_key_bytes(&database, &key_bytes);
    assert_eq!(
        me_status_with_token(&replaying_client, &token),
        Status::Forbidden
    );
    let response = replaying_client
        .post("/v1/auth/refresh")
        .cookie(("auth_token", token))
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);
    assert_removes_the_auth_cookie(&response);
}

#[test]
fn logging_out_without_a_valid_token_still_succeeds() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .post("/v1/auth/logout")
        .cookie(("auth_token", "not-a-token"))
        .dispatch();

    assert_eq!(response.status(), Status::NoContent);
}

fn assert_removes_the_auth_cookie(response: &rocket::local::blocking::LocalResponse<'_>) {
    let cookie = auth_cookie_set_by(response);
    assert_eq!(cookie.value(), "");
    assert_eq!(cookie.max_age(), Some(rocket::time::Duration::ZERO));
}

#[test]
fn logging_out_reports_a_server_error_but_removes_the_cookie_if_the_users_cannot_be_read() {
    let database = TestDatabase::start(0);
    let logged_in = logged_in_client(&database);
    database.execute("ALTER TABLE users RENAME TO unreadable_users");

    let response = logged_in.post("/v1/auth/logout").dispatch();

    assert_eq!(response.status(), Status::InternalServerError);
    assert_removes_the_auth_cookie(&response);
}

#[test]
fn logging_out_reports_a_server_error_but_removes_the_cookie_if_the_epoch_cannot_be_bumped() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = session_token_of(&logged_in);
    database.execute(
        "CREATE FUNCTION reject_user_update() RETURNS trigger AS $$ \
         BEGIN RAISE EXCEPTION 'update rejected'; END; $$ LANGUAGE plpgsql",
    );
    database.execute(
        "CREATE TRIGGER reject_user_update BEFORE UPDATE ON users \
         FOR EACH ROW EXECUTE FUNCTION reject_user_update()",
    );

    let response = logged_in.post("/v1/auth/logout").dispatch();

    assert_eq!(response.status(), Status::InternalServerError);
    assert_removes_the_auth_cookie(&response);
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM users WHERE session_epoch = 0"),
        1
    );
    let replaying_client = client_with_key_bytes(&database, &key_bytes);
    assert_eq!(me_status_with_token(&replaying_client, &token), Status::Ok);
}

#[test]
fn a_password_change_ends_all_other_sessions_but_keeps_the_changing_one() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let changing_session = logged_in_client_with_key_bytes(&database, &key_bytes);
    let other_session = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token_before_the_change = session_token_of(&changing_session);

    assert_eq!(
        change_password(
            &changing_session,
            PICKING_USER_PASSWORD,
            NEW_PASSWORD,
            NEW_PASSWORD
        ),
        Status::NoContent
    );

    assert_eq!(
        changing_session.get("/v1/auth/me").dispatch().status(),
        Status::Ok,
        "the session which changed the password must keep working with its new cookie"
    );
    assert_eq!(
        changing_session
            .post("/v1/auth/refresh")
            .dispatch()
            .status(),
        Status::Ok
    );
    assert_eq!(
        other_session.get("/v1/auth/me").dispatch().status(),
        Status::Forbidden
    );
    let replaying_client = client_with_key_bytes(&database, &key_bytes);
    assert_eq!(
        me_status_with_token(&replaying_client, &token_before_the_change),
        Status::Forbidden
    );
}

#[test]
fn a_bearer_token_in_the_authorization_header_is_not_accepted() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = session_token_of(&logged_in);
    let client_without_cookies = client_with_key_bytes(&database, &key_bytes);

    let response = client_without_cookies
        .get("/v1/auth/me")
        .header(Header::new("Authorization", format!("Bearer {token}")))
        .dispatch();

    assert_eq!(response.status(), Status::Forbidden);
}

#[test]
fn an_expired_token_is_rejected() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let client = client_with_key_bytes(&database, &key_bytes);
    let auth_time =
        unix_now() - (adventskalender_backend::session_lifetime_in_seconds() as u64 + 60 * 60);
    let (token, expires_at) = adventskalender_backend::get_token_for_user_with_auth_time(
        &database.picking_user,
        database.picking_user_id,
        0,
        HashSet::from(["http://localhost:5173".to_string()]),
        "http://localhost:5479".to_string(),
        &EncodingKey::from_ed_der(&key_bytes),
        auth_time as usize,
    )
    .expect("token creation must succeed");
    assert!(expires_at < unix_now());

    assert_eq!(me_status_with_token(&client, &token), Status::Forbidden);
}

#[test]
fn a_token_with_a_tampered_signature_or_a_foreign_key_is_rejected() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = session_token_of(&logged_in);
    let client = client_with_key_bytes(&database, &key_bytes);
    assert_eq!(me_status_with_token(&client, &token), Status::Ok);

    let signature_start = token.rfind('.').unwrap() + 1;
    let mut tampered = token.clone().into_bytes();
    tampered[signature_start] = if tampered[signature_start] == b'A' {
        b'B'
    } else {
        b'A'
    };
    let tampered = String::from_utf8(tampered).unwrap();
    assert_eq!(me_status_with_token(&client, &tampered), Status::Forbidden);

    let foreign_session = logged_in_client(&database);
    let foreign_token = session_token_of(&foreign_session);
    assert_eq!(
        me_status_with_token(&client, &foreign_token),
        Status::Forbidden
    );
}

fn login_from(client: &Client, ip: &str, username: &str, password: &str) -> Status {
    client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .header(Header::new("X-Real-IP", ip.to_string()))
        .body(json!({ "username": username, "password": password }).to_string())
        .dispatch()
        .status()
}

#[test]
fn an_oversized_username_is_rejected_without_counting_against_the_rate_limit() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    let ip = "192.0.2.40";

    for oversized in ["u".repeat(65), "€".repeat(65)] {
        for _ in 0..6 {
            assert_eq!(
                login_from(&client, ip, &oversized, PICKING_USER_PASSWORD),
                Status::BadRequest
            );
        }
    }
    assert_eq!(
        login_from(&client, ip, &"u".repeat(64), PICKING_USER_PASSWORD),
        Status::Unauthorized
    );
    assert_eq!(
        login_from(&client, ip, &database.picking_user, PICKING_USER_PASSWORD),
        Status::Ok
    );
}

#[test]
fn a_user_whose_existing_password_is_longer_than_72_bytes_can_still_log_in() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    let long_password = format!("{PICKING_USER_PASSWORD}-{}", "p".repeat(80));
    database.execute(&format!(
        "UPDATE users SET password_hash = '{}' WHERE id = {}",
        bcrypt::hash(&long_password, 4).unwrap(),
        database.picking_user_id
    ));

    assert_eq!(
        login(&client, &database.picking_user, &long_password).0,
        Status::Ok
    );
}

#[test]
fn a_login_body_larger_than_the_json_limit_is_refused() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client
        .post("/v1/auth/token")
        .header(ContentType::JSON)
        .body(
            json!({ "username": "someone", "password": "secret", "padding": "x".repeat(17 * 1024) })
                .to_string(),
        )
        .dispatch();

    assert_eq!(response.status(), Status::PayloadTooLarge);
}

#[test]
fn the_username_rate_limit_allows_more_attempts_than_the_ip_rate_limit() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    for ip in [
        "198.51.100.1",
        "198.51.100.2",
        "198.51.100.3",
        "198.51.100.4",
    ] {
        for _ in 0..5 {
            assert_eq!(
                login_from(&client, ip, &database.picking_user, "wrong"),
                Status::Unauthorized
            );
        }
        assert_eq!(
            login_from(&client, ip, &database.picking_user, "wrong"),
            Status::TooManyRequests,
            "each IP may only try five times"
        );
    }

    assert_eq!(
        login_from(
            &client,
            "198.51.100.5",
            &database.picking_user,
            PICKING_USER_PASSWORD
        ),
        Status::TooManyRequests,
        "the username is locked after twenty attempts, even from a fresh IP"
    );
}

#[test]
fn ipv6_clients_of_the_same_64_prefix_share_a_rate_limit() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    for host in 1..=5 {
        assert_eq!(
            login_from(
                &client,
                &format!("2001:db8:40:1::{host}"),
                &format!("ipv6-user-{host}"),
                "wrong"
            ),
            Status::Unauthorized
        );
    }

    assert_eq!(
        login_from(&client, "2001:db8:40:1:ffff::1", "ipv6-user-final", "wrong"),
        Status::TooManyRequests
    );
    assert_eq!(
        login_from(&client, "2001:db8:40:2::1", "ipv6-user-other", "wrong"),
        Status::Unauthorized
    );
}

#[test]
fn a_new_password_longer_than_72_bytes_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);
    let too_long = format!("{NEW_PASSWORD}{}", "x".repeat(73 - NEW_PASSWORD.len()));

    let (status, _, body) =
        change_password_reason(&client, PICKING_USER_PASSWORD, &too_long, &too_long);

    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_long"));
}

#[test]
fn listing_all_winners_groups_them_by_day_in_date_order() {
    let database = TestDatabase::start(6);
    let client = logged_in_client(&database);
    let third = pick_winners(&client, 2, &date_this_year(12, 3));
    let first = pick_winners(&client, 3, &date_this_year(12, 1));
    let second = pick_winners(&client, 1, &date_this_year(12, 2));

    let response = client.get("/v1/participants/won").dispatch();
    assert_eq!(response.status(), Status::Ok);
    let body = response.into_string().unwrap();

    let days: Vec<String> = [1, 2, 3].map(|day| date_this_year(12, day)).to_vec();
    let positions: Vec<usize> = days
        .iter()
        .map(|day| body.find(&format!("\"{day}\"")).expect(day))
        .collect();
    assert!(positions.is_sorted(), "days out of order: {body}");

    let winners: Value = rocket::serde::json::from_str(&body).unwrap();
    for (day, mut expected) in days.iter().zip([first, second, third]) {
        expected.sort_unstable();
        let ids: Vec<i32> = winners[day]
            .as_array()
            .unwrap()
            .iter()
            .map(|winner| winner["id"].as_i64().unwrap() as i32)
            .collect();
        assert_eq!(ids, expected, "winners on {day}");
    }
}

#[test]
fn the_winners_of_a_day_are_listed_ordered_by_id() {
    let database = TestDatabase::start(5);
    let client = logged_in_client(&database);
    let day = date_this_year(12, 5);
    let mut expected = pick_winners(&client, 4, &day);
    pick_winners(&client, 1, &date_this_year(12, 6));
    expected.sort_unstable();

    let response = client.get(format!("/v1/participants/won/{day}")).dispatch();
    assert_eq!(response.status(), Status::Ok);
    let ids: Vec<i32> = response
        .into_json::<Vec<Value>>()
        .unwrap()
        .iter()
        .map(|winner| {
            assert!(winner["first_name"].is_string());
            assert!(winner["last_name"].is_string());
            winner["id"].as_i64().unwrap() as i32
        })
        .collect();
    assert_eq!(ids, expected);
}

#[test]
fn the_number_of_winners_of_a_day_is_counted() {
    let database = TestDatabase::start(5);
    let client = logged_in_client(&database);
    pick_winners(&client, 3, &date_this_year(12, 7));
    pick_winners(&client, 1, &date_this_year(12, 8));

    for (day, expected) in [(7, 3), (8, 1), (9, 0)] {
        let response = client
            .get(format!(
                "/v1/participants/won/{}/count",
                date_this_year(12, day)
            ))
            .dispatch();
        assert_eq!(response.status(), Status::Ok);
        assert_eq!(response.into_json::<usize>(), Some(expected), "day {day}");
    }
}

#[test]
fn the_winner_routes_require_an_authenticated_user() {
    let database = TestDatabase::start(1);
    let client = client(&database);
    let day = date_this_year(12, 1);

    for path in [
        "/v1/participants/won".to_string(),
        format!("/v1/participants/won/{day}"),
        format!("/v1/participants/won/{day}/count"),
    ] {
        let status = client.get(path.as_str()).dispatch().status();
        assert!(
            status == Status::Unauthorized || status == Status::Forbidden,
            "{path}: {status}"
        );
    }
}

#[test]
fn the_backend_version_is_served_without_authentication() {
    let database = TestDatabase::start(0);
    let client = client(&database);

    let response = client.get("/v1/version").dispatch();

    assert_eq!(response.status(), Status::Ok);
    let body = response.into_json::<Value>().unwrap();
    for field in [
        "backend_version",
        "backend_arch",
        "rustc_version",
        "build_date",
        "build_time",
    ] {
        assert!(
            body[field].as_str().is_some_and(|value| !value.is_empty()),
            "{field}: {body}"
        );
    }
    let build_time = body["build_time"].as_str().unwrap();
    assert!(
        build_time.len() == 8
            && build_time
                .char_indices()
                .all(|(index, character)| match index {
                    2 | 5 => character == ':',
                    _ => character.is_ascii_digit(),
                }),
        "build_time is not HH:MM:SS: {build_time}"
    );
}

#[test]
fn a_username_of_64_multi_byte_characters_can_log_in_and_65_characters_are_rejected() {
    let database = TestDatabase::start(0);
    let client = client(&database);
    let ip = "192.0.2.41";
    let username = "ä".repeat(64);
    database.execute(&format!(
        "UPDATE users SET username = '{username}' WHERE id = {}",
        database.picking_user_id
    ));

    assert_eq!(
        login_from(&client, ip, &username, PICKING_USER_PASSWORD),
        Status::Ok
    );
    assert_eq!(
        login_from(&client, ip, &"ä".repeat(65), PICKING_USER_PASSWORD),
        Status::BadRequest
    );
}

#[test]
fn logging_out_with_a_token_within_the_leeway_keeps_the_other_sessions() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let other_session = logged_in_client_with_key_bytes(&database, &key_bytes);
    let auth_time =
        unix_now() - (adventskalender_backend::session_lifetime_in_seconds() as u64 + 2);
    let (token, expires_at) = adventskalender_backend::get_token_for_user_with_auth_time(
        &database.picking_user,
        database.picking_user_id,
        0,
        HashSet::from(["http://localhost:5173".to_string()]),
        "http://localhost:5479".to_string(),
        &EncodingKey::from_ed_der(&key_bytes),
        auth_time as usize,
    )
    .expect("token creation must succeed");
    assert!(expires_at < unix_now());
    let expiring_client = client_with_key_bytes(&database, &key_bytes);

    let response = expiring_client
        .post("/v1/auth/logout")
        .cookie(("auth_token", token))
        .dispatch();

    assert_eq!(response.status(), Status::NoContent);
    let removal = response
        .cookies()
        .get("auth_token")
        .expect("the logout must remove the auth_token cookie");
    assert_eq!(removal.value(), "");
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM users WHERE session_epoch = 0"),
        database.count("SELECT COUNT(*) AS count FROM users")
    );
    assert_eq!(
        other_session.get("/v1/auth/me").dispatch().status(),
        Status::Ok
    );
}

#[test]
fn picking_stores_the_day_and_the_picking_and_audit_times_in_utc() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let day = date_this_year(12, 6);

    assert_eq!(pick_winners(&client, 2, &day).len(), 2);

    let within_the_last_minute_in_utc = "BETWEEN (now() AT TIME ZONE 'UTC') - INTERVAL '1 minute' \
         AND (now() AT TIME ZONE 'UTC') + INTERVAL '1 minute'";
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants \
             WHERE won_on = DATE '{day}' AND picking_time {within_the_last_minute_in_utc}"
        )),
        2
    );
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM performed_actions \
             WHERE action = 'picked_winner' AND time_of_action {within_the_last_minute_in_utc}"
        )),
        2
    );
}

#[test]
fn the_date_routes_accept_dates_without_zero_padding() {
    let database = TestDatabase::start(3);
    let client = logged_in_client(&database);
    let padded = date_this_year(12, 6);
    let unpadded = padded.replace("-12-06", "-12-6");

    let mut picked = pick_winners(&client, 2, &unpadded);
    picked.sort_unstable();
    assert_eq!(picked.len(), 2);

    let response = client
        .get(format!("/v1/participants/won/{unpadded}"))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);
    let listed: Vec<i32> = response
        .into_json::<Vec<Value>>()
        .unwrap()
        .iter()
        .map(|winner| winner["id"].as_i64().unwrap() as i32)
        .collect();
    assert_eq!(listed, picked);

    let response = client
        .get(format!("/v1/participants/won/{unpadded}/count"))
        .dispatch();
    assert_eq!(response.into_json::<usize>(), Some(2));

    let all_winners = client
        .get("/v1/participants/won")
        .dispatch()
        .into_json::<Value>()
        .unwrap();
    assert_eq!(all_winners[&padded].as_array().map(Vec::len), Some(2));
}
