use rocket_sync_db_pools::database;
use rocket_sync_db_pools::diesel::PgConnection;

#[database("adventskalender")]
pub struct AdventskalenderDatabaseConnection(PgConnection);

pub struct BackendConfiguration {
    /// The pre-shared-key which is used to sign and validate the generated token.
    pub token_signature_psk: String,
}
