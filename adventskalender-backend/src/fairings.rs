use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::PgConnection;

#[derive(Clone)]
pub struct BackendConfiguration {
    /// The pre-shared-key which is used to sign and validate the generated token.
    pub token_signature_psk: String,
}

/// TODO
pub struct AdventskalenderDatabaseConnection(Pool<ConnectionManager<PgConnection>>);

/// TODO
impl AdventskalenderDatabaseConnection {
    /// TODO
    #[inline(always)]
    pub fn get(&self) -> Result<PooledConnection<ConnectionManager<PgConnection>>, r2d2::Error> {
        self.0.get()
    }
}

/// TODO
impl From<Pool<ConnectionManager<PgConnection>>> for AdventskalenderDatabaseConnection {
    /// TODO
    #[inline(always)]
    fn from(pool: Pool<ConnectionManager<PgConnection>>) -> Self {
        AdventskalenderDatabaseConnection(pool)
    }
}
