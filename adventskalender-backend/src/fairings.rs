use diesel::r2d2::{ConnectionManager, Pool};
use diesel::PgConnection;
use jsonwebtoken::{DecodingKey, EncodingKey};
use rocket::fairing::{Fairing, Info, Kind};
use rocket::{Request, Response};
use std::collections::HashSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Clone)]
pub struct BackendConfiguration {
    /// The host base URL of the API (e.g. https://www.example.com; without a path like /api).
    pub api_host: String,
    /// The precomputed URL under which the JWKS with the public key is served.
    pub jwks_uri: String,
    /// The key which is used to encode a token signature.
    pub encoding_key: EncodingKey,
    /// The key which is used to decode a token signature.
    pub decoding_key: DecodingKey,
    /// The raw Ed25519 key bytes in PKCS8 format (for JWKS endpoint).
    pub ed25519_key_bytes: Vec<u8>,
    /// The UUID used for the health check on  healthcheck.io.
    pub healthcheck_project: String,
    /// A list of URLs which represent the audience for this token.
    pub token_audience: HashSet<String>,
    /// The precomputed parameter set which is used to validate incoming tokens.
    pub token_validation: jsonwebtoken::Validation,
}

/// The reason why a blocking database task did not run to completion: either the connection pool
/// did not provide a connection, or the blocking task itself could not be executed.
#[derive(Debug)]
pub enum BlockingDatabaseError {
    NoConnection(r2d2::Error),
    Join(rocket::tokio::task::JoinError),
}

impl Display for BlockingDatabaseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            BlockingDatabaseError::NoConnection(error) => write!(
                f,
                "could not get a connection from the database connection pool. The error was: {error}"
            ),
            BlockingDatabaseError::Join(error) => {
                write!(f, "the blocking database task failed. The error was: {error}")
            }
        }
    }
}

impl Error for BlockingDatabaseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            BlockingDatabaseError::NoConnection(error) => Some(error),
            BlockingDatabaseError::Join(error) => Some(error),
        }
    }
}

/// TODO
pub struct AdventskalenderDatabaseConnection(Pool<ConnectionManager<PgConnection>>);

/// TODO
impl AdventskalenderDatabaseConnection {
    /// Runs the given closure with a pooled connection on the blocking thread pool so that
    /// neither the database work nor the bcrypt password hashing blocks one of Rocket's async
    /// worker threads. Cloning the pool is cheap, the connection is taken inside the blocking
    /// task and returned to the pool when the task ends.
    pub async fn run_blocking<T, F>(&self, work: F) -> Result<T, BlockingDatabaseError>
    where
        T: Send + 'static,
        F: FnOnce(&mut PgConnection) -> T + Send + 'static,
    {
        let pool = self.0.clone();
        rocket::tokio::task::spawn_blocking(move || {
            let mut connection = pool.get().map_err(BlockingDatabaseError::NoConnection)?;
            Ok(work(&mut connection))
        })
        .await
        .map_err(BlockingDatabaseError::Join)?
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

/// Fairing that adds security headers to all HTTP responses
pub struct SecurityHeaders;

#[rocket::async_trait]
impl Fairing for SecurityHeaders {
    fn info(&self) -> Info {
        Info {
            name: "Security Headers",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, _request: &'r Request<'_>, response: &mut Response<'r>) {
        // prevent MIME type sniffing
        response.set_raw_header("X-Content-Type-Options", "nosniff");

        // prevent clickjacking by disallowing embedding in frames
        response.set_raw_header("X-Frame-Options", "DENY");

        // enable XSS protection in older browsers (header is deprecated but still useful for legacy browsers)
        response.set_raw_header("X-XSS-Protection", "1; mode=block");

        // enforce HTTPS for 1 year (31536000 seconds)
        // WARNING: only set this in production with proper HTTPS setup
        #[cfg(not(debug_assertions))]
        response.set_raw_header(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        );

        // control referrer information sent with requests
        response.set_raw_header("Referrer-Policy", "strict-origin-when-cross-origin");

        // Content Security Policy - restrictive default (fonts self-hosted)
        response.set_raw_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; media-src 'none'; worker-src 'none'",
        );

        // prevent browser features and APIs
        response.set_raw_header(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
        );
    }
}
