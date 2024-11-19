use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::PgConnection;

#[derive(Clone)]
pub struct BackendConfiguration {
    /// The pre-shared-key which is used to sign and validate the generated token.
    pub token_signature_psk: String,
    /// The UUID used for the health check on  healthcheck.io.
    pub healthcheck_project: String,
    /// The issuer of the token (the URL of the API).
    pub token_issuer: String,
    /// A list of URLs which represent the audience for this token.
    pub token_audience: Vec<String>,
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
