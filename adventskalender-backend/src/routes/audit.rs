use crate::fairings::AdventskalenderDatabaseConnection;
use crate::guards::AuthenticatedUser;
use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::{State, get};
use serde::Serialize;

#[derive(Serialize)]
pub struct AuditEventCount {
    /// The number of audit events written.
    pub count: i64,
}

#[get("/audit/count")]
pub async fn get_audit_event_count(
    db_connection_pool: &State<AdventskalenderDatabaseConnection>,
    _authenticated_user: AuthenticatedUser,
) -> Result<Json<AuditEventCount>, Status> {
    use crate::schema::performed_actions::dsl::performed_actions;
    use diesel::dsl::count_star;
    use diesel::{QueryDsl, RunQueryDsl};
    use log::{debug, error};

    // get the number of audit events currently stored in the database, on a blocking thread so
    // the database work does not block the async runtime
    let maybe_audit_event_count = match db_connection_pool
        .run_blocking(|db_connection| {
            db_connection
                .build_transaction()
                .read_only()
                .run::<_, diesel::result::Error, _>(|connection| {
                    match performed_actions.select(count_star()).first::<i64>(connection) {
                        Err(error) => {
                            error!("Could not get the numnber of events in the audit log. The error was: {error}");
                            Err(error)
                        }
                        Ok(count) => {
                            debug!("Got {count} events in the audit log");
                            Ok(count)
                        }
                    }
                })
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            error!("Could not get the number of events in the audit log. The error was: {error}");
            return Err(Status::InternalServerError);
        }
    };

    // return the expected result
    match maybe_audit_event_count {
        Ok(count) => Ok(Json(AuditEventCount { count })),
        Err(_) => Err(Status::InternalServerError),
    }
}
