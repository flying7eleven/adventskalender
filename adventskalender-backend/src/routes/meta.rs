use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration, SIGNING_KEY_ID};
use crate::{BACKOFF_HANDLER, ServiceStatus, build_time_of_day};
use rocket::http::Status;
use rocket::serde::json::{Json, json};
use rocket::{State, get};
use serde::Serialize;

/// See https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata for more
#[derive(Serialize)]
pub struct OpenIdConfiguration {
    pub issuer: String,
    pub jwks_uri: String,
    pub id_token_signing_alg_values_supported: Vec<String>,
}

#[derive(Serialize)]
pub struct JsonWebKey {
    pub kty: String,
    #[serde(rename = "use")]
    pub use_: String,
    pub kid: String,
    pub alg: String,
    pub crv: String,
    pub x: String,
}

#[derive(Serialize)]
pub struct JwksResponse {
    pub keys: Vec<JsonWebKey>,
}

#[get("/jwks.json")]
pub async fn get_jwks(config: &State<BackendConfiguration>) -> Json<JwksResponse> {
    Json(JwksResponse {
        keys: vec![JsonWebKey {
            kty: "OKP".to_string(),
            use_: "sig".to_string(),
            kid: SIGNING_KEY_ID.to_string(),
            alg: "EdDSA".to_string(),
            crv: "Ed25519".to_string(),
            x: config.public_key_x.clone(),
        }],
    })
}

#[get("/openid-configuration")]
pub async fn get_openid_configuration(
    config: &State<BackendConfiguration>,
) -> Result<Json<OpenIdConfiguration>, Status> {
    Ok(Json(OpenIdConfiguration {
        issuer: config.api_host.clone(),
        jwks_uri: config.jwks_uri.clone(),
        id_token_signing_alg_values_supported: vec!["EdDSA".to_string()],
    }))
}

#[derive(Serialize)]
pub struct VersionInformation {
    /// The version of the backend which is currently running.
    pub backend_version: &'static str,
    /// The architecture the backend was build for.
    pub backend_arch: &'static str,
    /// The version of the rustc compiler used to compile the backend.
    pub rustc_version: &'static str,
    /// The date on which the backend was build.
    pub build_date: &'static str,
    /// The time on which the backend was build.
    pub build_time: String,
}

#[get("/version")]
pub async fn get_backend_version() -> Json<VersionInformation> {
    Json(VersionInformation {
        backend_version: env!("VERGEN_GIT_DESCRIBE"),
        backend_arch: env!("VERGEN_CARGO_TARGET_TRIPLE"),
        rustc_version: env!("VERGEN_RUSTC_SEMVER"),
        build_date: env!("VERGEN_BUILD_DATE"),
        build_time: build_time_of_day(),
    })
}

#[derive(Serialize)]
pub struct HealthCheck {
    /// A flag which indicates if the database is healthy or not.
    pub database_healthy: bool,
    /// A flag which indicates if the backend itself is healthy or not.
    pub backend_healthy: bool,
}

pub fn notify_service_up(project_uuid: &str) {
    use healthchecks::ping::get_client;
    use log::error;

    match get_client(project_uuid) {
        Ok(client) => {
            if !client.report_success() {
                error!("Could not notify healthcheck-io about a successful health-check.");
            }
        }
        Err(error) => error!(
            "Could not notify healthcheck-io about a successful health-check. The error was: {error}"
        ),
    };
}

pub fn notify_service_down(project_uuid: &str, error_data: &str) {
    use healthchecks::ping::get_client;
    use log::error;

    match get_client(project_uuid) {
        Ok(client) => {
            if !client.report_failure_with_logs(error_data) {
                error!("Could not notify healthcheck-io about a failed health-check.");
            }
        }
        Err(error) => error!(
            "Could not notify healthcheck-io about a failed health-check. The error was: {error}"
        ),
    };
}

#[get("/health")]
pub async fn check_backend_health(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    config: &State<BackendConfiguration>,
) -> Result<Json<HealthCheck>, (Status, Json<HealthCheck>)> {
    use diesel::RunQueryDsl;
    use log::{debug, error};

    // check if the connection to the database is working or not, on a blocking thread so the
    // database work does not block the async runtime
    let database_is_healthy = match db_connection_pool
        .run_blocking(|db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<_, diesel::result::Error, _>(|connection| {
                    if let Err(query_error) = diesel::sql_query("SELECT 1").execute(connection) {
                        error!("The health check of the database connection failed with the following error: {query_error}");
                        return Err(query_error);
                    }
                    debug!("Last health check was successful");
                    Ok(())
                })
        })
        .await
    {
        Ok(Ok(())) => true,
        Ok(Err(query_error)) => {
            error!("The health check of the database connection failed. The error was: {query_error}");
            false
        }
        Err(error) => {
            error!("Could not run the database health check on a blocking thread. The error was: {error}");
            false
        }
    };

    // if the database is healthy, we can return the status immediately
    if database_is_healthy {
        if let Some(project_uuid) = config.healthcheck_project
            && should_ping(ServiceStatus::Up)
        {
            // the ping itself runs fire-and-forget on a blocking thread so that the health
            // route does not wait for healthchecks.io
            rocket::tokio::task::spawn_blocking(move || {
                notify_service_up(&project_uuid.to_string());
            });
        }
        return Ok(Json(HealthCheck {
            database_healthy: true,
            backend_healthy: true,
        }));
    }

    // it seems that the health check failed, indicate that by returning a 503
    Err(unhealthy_response(config, false, false))
}

/// Asks the process-wide backoff handler whether a ping for `status` is due. A poisoned lock is
/// recovered, since the handler only holds plain timestamps which stay consistent.
fn should_ping(status: ServiceStatus) -> bool {
    BACKOFF_HANDLER
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .should_call(status)
}

fn unhealthy_response(
    config: &BackendConfiguration,
    database_healthy: bool,
    backend_healthy: bool,
) -> (Status, Json<HealthCheck>) {
    let health_check = HealthCheck {
        database_healthy,
        backend_healthy,
    };
    if let Some(project_uuid) = config.healthcheck_project
        && should_ping(ServiceStatus::Down)
    {
        // the ping itself runs fire-and-forget on a blocking thread so that the health route does
        // not wait for healthchecks.io
        let error_data = json!(health_check).to_string();
        rocket::tokio::task::spawn_blocking(move || {
            notify_service_down(&project_uuid.to_string(), &error_data);
        });
    }
    (Status::ServiceUnavailable, Json(health_check))
}
