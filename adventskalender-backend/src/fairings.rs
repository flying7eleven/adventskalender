use rocket_sync_db_pools::database;
use rocket_sync_db_pools::diesel::PgConnection;

#[database("adventskalender")]
pub struct AdventskalenderDatabaseConnection(PgConnection);
