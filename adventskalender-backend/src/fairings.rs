use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::PgConnection;
use jsonwebtoken::{DecodingKey, EncodingKey};
use std::collections::HashSet;

#[derive(Clone)]
pub struct BackendConfiguration {
    /// The host base URL of the API (e.g. https://www.example.com; without a path like /api).
    pub api_host: String,
    /// The key which is used to encode a token signature.
    pub encoding_key: Option<EncodingKey>,
    /// The key which is used to decode a token signature.
    pub decoding_key: Option<DecodingKey>,
    /// The UUID used for the health check on  healthcheck.io.
    pub healthcheck_project: String,
    /// A list of URLs which represent the audience for this token.
    pub token_audience: HashSet<String>,
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
