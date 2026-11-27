use diesel::PgConnection;
use diesel::r2d2::{ConnectionManager, Pool};
use jsonwebtoken::{DecodingKey, EncodingKey};
use ring::signature::{Ed25519KeyPair, KeyPair};
use rocket::fairing::{Fairing, Info, Kind};
use rocket::{Request, Response};
use std::collections::HashSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

/// The key ID which the issued tokens carry and the JWKS advertises for the signing key.
pub const SIGNING_KEY_ID: &str = "adventskalender-key-1";

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
    /// The base64url-encoded public key, served as the `x` parameter of the JWK.
    pub public_key_x: String,
    /// The UUID of the healthchecks.io check which is pinged, `None` disables the pings.
    pub healthcheck_project: Option<uuid::Uuid>,
    /// A list of URLs which represent the audience for this token.
    pub token_audience: HashSet<String>,
    /// The precomputed parameter set which is used to validate incoming tokens.
    pub token_validation: jsonwebtoken::Validation,
    /// Whether the session cookie carries the `Secure` attribute.
    pub cookie_secure: bool,
}

impl BackendConfiguration {
    /// Builds the configuration from the Ed25519 signing key in the PKCS#8 DER format, together
    /// with the precomputed parameter set which is used to validate incoming tokens: EdDSA
    /// signatures, the supplied audience and the API host as the only accepted issuer.
    pub fn from_pkcs8(
        key_pkcs8: &[u8],
        api_host: String,
        jwks_uri: String,
        healthcheck_project: Option<uuid::Uuid>,
        token_audience: HashSet<String>,
        cookie_secure: bool,
    ) -> Result<Self, ring::error::KeyRejected> {
        use base64::Engine;
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;

        let public_key = Ed25519KeyPair::from_pkcs8(key_pkcs8)?
            .public_key()
            .as_ref()
            .to_vec();

        let mut token_validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::EdDSA);
        // allow a time difference of max. 5 seconds
        token_validation.leeway = 5;
        token_validation.validate_exp = true;
        token_validation.validate_nbf = true;
        token_validation.validate_aud = true;
        token_validation.aud = Some(token_audience.clone());
        let mut issuer_set = HashSet::new();
        issuer_set.insert(api_host.clone());
        token_validation.iss = Some(issuer_set);

        Ok(BackendConfiguration {
            api_host,
            jwks_uri,
            encoding_key: EncodingKey::from_ed_der(key_pkcs8),
            decoding_key: DecodingKey::from_ed_der(&public_key),
            public_key_x: URL_SAFE_NO_PAD.encode(&public_key),
            healthcheck_project,
            token_audience,
            token_validation,
            cookie_secure,
        })
    }
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
                write!(
                    f,
                    "the blocking database task failed. The error was: {error}"
                )
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

/// A cheap handle to the database connection pool which provides the helpers to run database
/// work on the blocking thread pool.
pub struct AdventskalenderDatabaseConnection(Pool<ConnectionManager<PgConnection>>);

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

impl From<Pool<ConnectionManager<PgConnection>>> for AdventskalenderDatabaseConnection {
    #[inline(always)]
    fn from(pool: Pool<ConnectionManager<PgConnection>>) -> Self {
        AdventskalenderDatabaseConnection(pool)
    }
}

/// The security headers which every response carries.
const SECURITY_HEADERS: [(&str, &str); 6] = [
    // prevent MIME type sniffing
    ("X-Content-Type-Options", "nosniff"),
    // prevent clickjacking by disallowing embedding in frames
    ("X-Frame-Options", "DENY"),
    // disable the legacy XSS auditor of older browsers, which can itself introduce vulnerabilities
    ("X-XSS-Protection", "0"),
    // control referrer information sent with requests
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    // Content Security Policy - restrictive default (fonts self-hosted)
    (
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; media-src 'none'; worker-src 'none'",
    ),
    // prevent browser features and APIs
    (
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
    ),
];

/// Enforces HTTPS for one year on this host only; neither subdomains nor the browsers' preload
/// list are committed, since the backend does not control where else the domain is used.
const STRICT_TRANSPORT_SECURITY: (&str, &str) = ("Strict-Transport-Security", "max-age=31536000");

/// The headers the [`SecurityHeaders`] fairing sets; HSTS only in release builds, since debug
/// builds are served over plain HTTP.
fn security_headers(
    include_strict_transport_security: bool,
) -> impl Iterator<Item = (&'static str, &'static str)> {
    SECURITY_HEADERS
        .into_iter()
        .chain(include_strict_transport_security.then_some(STRICT_TRANSPORT_SECURITY))
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
        for (name, value) in security_headers(cfg!(not(debug_assertions))) {
            response.set_raw_header(name, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{BackendConfiguration, security_headers};
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use ring::rand::SystemRandom;
    use ring::signature::{Ed25519KeyPair, KeyPair};
    use std::collections::HashSet;

    fn configuration_from(
        key_pkcs8: &[u8],
    ) -> Result<BackendConfiguration, ring::error::KeyRejected> {
        BackendConfiguration::from_pkcs8(
            key_pkcs8,
            "https://example.com".to_string(),
            "https://example.com/.well-known/jwks.json".to_string(),
            None,
            HashSet::from(["https://example.com".to_string()]),
            true,
        )
    }

    #[test]
    fn the_release_headers_carry_hsts_without_subdomains_and_preload() {
        let headers: Vec<_> = security_headers(true).collect();

        assert!(headers.contains(&("Strict-Transport-Security", "max-age=31536000")));
        assert!(headers.contains(&("X-Content-Type-Options", "nosniff")));
        assert!(headers.contains(&("X-Frame-Options", "DENY")));
    }

    #[test]
    fn the_debug_headers_carry_no_hsts() {
        assert!(
            security_headers(false).all(|(name, _)| name != "Strict-Transport-Security"),
            "debug builds are served over plain HTTP and must not send HSTS"
        );
        assert!(security_headers(false).any(|(name, _)| name == "Content-Security-Policy"));
    }

    #[test]
    fn the_configuration_precomputes_the_public_key_of_the_jwk() {
        let document = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        let expected_public_key = Ed25519KeyPair::from_pkcs8(document.as_ref())
            .unwrap()
            .public_key()
            .as_ref()
            .to_vec();

        let configuration = configuration_from(document.as_ref()).unwrap();

        assert_eq!(
            URL_SAFE_NO_PAD.decode(&configuration.public_key_x).unwrap(),
            expected_public_key
        );
    }

    #[test]
    fn a_key_which_is_not_in_the_pkcs8_format_is_rejected() {
        assert!(configuration_from(b"not a key").is_err());
    }
}
