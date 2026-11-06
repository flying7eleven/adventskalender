mod common;

use adventskalender_backend::fairings::BackendConfiguration;
use adventskalender_backend::routes::mount_routes;
use common::{TestDatabase, PICKING_USER_PASSWORD};
use jsonwebtoken::{DecodingKey, EncodingKey};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use rocket::http::{ContentType, Header, Status};
use rocket::local::blocking::Client;
use rocket::serde::json::{json, Value};
use std::collections::HashSet;

fn fresh_key_bytes() -> Vec<u8> {
    Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
        .unwrap()
        .as_ref()
        .to_vec()
}

fn client_with_key_bytes(database: &TestDatabase, key_bytes: &[u8]) -> Client {
    let configuration = BackendConfiguration::new(
        "http://localhost:5479".to_string(),
        "http://localhost:5479/.well-known/jwks.json".to_string(),
        EncodingKey::from_ed_der(key_bytes),
        DecodingKey::from_ed_der(
            Ed25519KeyPair::from_pkcs8(key_bytes)
                .unwrap()
                .public_key()
                .as_ref(),
        ),
        key_bytes.to_vec(),
        "".to_string(),
        HashSet::from(["http://localhost:5173".to_string()]),
    )
    .unwrap();
    let rocket = mount_routes(
        rocket::build()
            .manage(configuration)
            .manage(database.new_connection_pool())
            .attach(
                adventskalender_backend::cors_fairing(["http://localhost:5173".to_string()])
                    .unwrap(),
            ),
    );
    Client::tracked(rocket).unwrap()
}

fn client(database: &TestDatabase) -> Client {
    client_with_key_bytes(database, &fresh_key_bytes())
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
    logged_in_client_with_key_bytes(database, &fresh_key_bytes())
}

fn logged_in_client_with_key_bytes(database: &TestDatabase, key_bytes: &[u8]) -> Client {
    let client = client_with_key_bytes(database, key_bytes);
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::NoContent
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
        .post("/v1/participants/pick/2/for/2026-12-24")
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
fn picking_more_winners_than_the_day_allows_is_a_conflict() {
    let database = TestDatabase::start(7);
    let client = logged_in_client(&database);

    let response = client
        .post("/v1/participants/pick/6/for/2026-12-24")
        .dispatch();

    assert_eq!(response.status(), Status::Conflict);
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
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
    let winner_ids = pick_winners(&client, 2, "2026-12-24");

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
}

#[test]
fn the_same_package_can_only_be_assigned_once_per_day() {
    let database = TestDatabase::start(2);
    let client = logged_in_client(&database);
    let winner_ids = pick_winners(&client, 2, "2026-12-24");

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
    let first_day_winner = pick_winners(&client, 1, "2026-12-24")[0];
    let second_day_winner = pick_winners(&client, 1, "2026-12-25")[0];

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
    let winner_id = pick_winners(&client, 1, "2026-12-24")[0];

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
    let winner_ids = pick_winners(&client, 2, "2026-12-24");

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
        login(&client, "unknown", PICKING_USER_PASSWORD),
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
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
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
) -> (Status, Option<Value>) {
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
    let body = response.into_json::<Value>();
    (status, body)
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
    assert_eq!(
        login(&client, &database.picking_user, NEW_PASSWORD),
        Status::NoContent
    );
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::Unauthorized
    );
}

#[test]
fn changing_the_password_with_a_wrong_current_password_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, body) = change_password_reason(
        &client,
        "definitely-not-the-password",
        NEW_PASSWORD,
        NEW_PASSWORD,
    );
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("wrong_current_password"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::NoContent
    );
}

#[test]
fn changing_the_password_with_differing_repetitions_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, body) = change_password_reason(
        &client,
        PICKING_USER_PASSWORD,
        NEW_PASSWORD,
        "something-else",
    );
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("passwords_do_not_match"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::NoContent
    );
}

#[test]
fn changing_the_password_to_a_too_short_one_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let (status, body) = change_password_reason(&client, PICKING_USER_PASSWORD, "Sh0r!t", "Sh0r!t");
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_short"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::NoContent
    );
}

#[test]
fn changing_the_password_to_a_too_weak_one_is_rejected_with_a_reason() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);

    let weak_password = "aaaaaaaa";
    let (status, body) =
        change_password_reason(&client, PICKING_USER_PASSWORD, weak_password, weak_password);
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_weak"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::NoContent
    );
}

#[test]
fn changing_the_password_of_a_deleted_user_is_a_server_error() {
    let database = TestDatabase::start(0);
    let client = logged_in_client(&database);
    database.execute("DELETE FROM performed_actions");
    database.execute("DELETE FROM users");

    assert_eq!(
        change_password(&client, PICKING_USER_PASSWORD, NEW_PASSWORD, NEW_PASSWORD),
        Status::InternalServerError
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
fn a_bearer_token_in_the_authorization_header_is_accepted_as_fallback() {
    let database = TestDatabase::start(0);
    let key_bytes = fresh_key_bytes();
    let logged_in = logged_in_client_with_key_bytes(&database, &key_bytes);
    let token = logged_in
        .cookies()
        .get("auth_token")
        .expect("a login must set the auth_token cookie")
        .value()
        .to_string();
    let client_without_cookies = client_with_key_bytes(&database, &key_bytes);

    let response = client_without_cookies
        .get("/v1/auth/me")
        .header(Header::new("Authorization", format!("Bearer {token}")))
        .dispatch();
    assert_eq!(response.status(), Status::Ok);

    let response = client_without_cookies
        .get("/v1/auth/me")
        .header(Header::new("Authorization", format!("NotBearer {token}")))
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);

    let response = client_without_cookies
        .get("/v1/auth/me")
        .header(Header::new("Authorization", "justonepart"))
        .dispatch();
    assert_eq!(response.status(), Status::Forbidden);
}
#[test]
fn picking_without_logging_in_is_forbidden_and_marks_nobody() {
    let database = TestDatabase::start(1);
    let client = client(&database);

    let response = client
        .post("/v1/participants/pick/1/for/2026-12-24")
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
    let winner_id = pick_winners(&client, 1, "2026-12-24")[0];

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
}

#[test]
fn refreshing_the_session_of_a_deleted_user_is_forbidden() {
    let database = TestDatabase::start(0);
    let logged_in = logged_in_client(&database);
    database.execute("DELETE FROM performed_actions");
    database.execute("DELETE FROM users");

    let response = logged_in.post("/v1/auth/refresh").dispatch();

    assert_eq!(response.status(), Status::Forbidden);
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
    let winner_id = pick_winners(&client, 1, "2026-12-24")[0];

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

    let (status, body) = change_password_reason(&client, PICKING_USER_PASSWORD, "äöüä", "äöüä");
    assert_eq!(status, Status::UnprocessableEntity);
    assert_eq!(body.unwrap()["reason"], json!("password_too_short"));
    assert_eq!(
        login(&client, &database.picking_user, PICKING_USER_PASSWORD),
        Status::NoContent
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
