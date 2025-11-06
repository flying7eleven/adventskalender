use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel::PgConnection;
use jsonwebtoken::{DecodingKey, EncodingKey};
use rocket::fairing::{Fairing, Info, Kind};
use rocket::{Request, Response};
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

        // Content Security Policy - restrictive default
        response.set_raw_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        );

        // prevent browser features and APIs
        response.set_raw_header(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
        );
    }
}
