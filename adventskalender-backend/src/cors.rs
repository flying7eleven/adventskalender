use log::warn;
use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::{Method, Status};
use rocket::route::{Handler, Outcome, Route};
use rocket::{uri, Build, Data, Request, Response, Rocket};
use std::collections::HashSet;
use std::fmt;

const ALLOWED_METHODS: [Method; 4] = [Method::Get, Method::Post, Method::Put, Method::Delete];
const EXPOSED_HEADERS: &str = "Retry-After";
const REJECTION_PATH: &str = "/cors/rejected";

/// A fairing which allows cross-origin requests only from an exact allowlist of origins.
///
/// Requests without an `Origin` header pass untouched. Requests from other origins are rerouted
/// to a route answering 403 before any application route runs, which doubles as a CSRF check.
/// Preflight requests are answered by the fairing itself with 204.
pub struct Cors {
    allowed_origins: HashSet<String>,
}

/// A configured origin which is not a valid `scheme://host[:port]` origin.
#[derive(Debug)]
pub struct InvalidOrigin(String);

impl fmt::Display for InvalidOrigin {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "'{}' is not a valid CORS origin", self.0)
    }
}

impl std::error::Error for InvalidOrigin {}

#[derive(Clone, Copy)]
enum Verdict {
    NotCors,
    Preflight,
    Actual,
    Rejected,
}

#[derive(Clone)]
struct Rejection;

#[rocket::async_trait]
impl Handler for Rejection {
    async fn handle<'r>(&self, _: &'r Request<'_>, _: Data<'r>) -> Outcome<'r> {
        Outcome::Error(Status::Forbidden)
    }
}

impl Cors {
    pub fn new<I, S>(allowed_origins: I) -> Result<Self, InvalidOrigin>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let allowed_origins = allowed_origins
            .into_iter()
            .map(|origin| serialize_origin(origin.as_ref()))
            .collect::<Result<_, _>>()?;
        Ok(Cors { allowed_origins })
    }

    fn judge(&self, request: &Request<'_>) -> Verdict {
        let Some(origin) = request.headers().get_one("Origin") else {
            return Verdict::NotCors;
        };
        if !self.allowed_origins.contains(origin) {
            warn!(
                "Rejected a request to {} from the origin '{origin}'",
                request.uri()
            );
            return Verdict::Rejected;
        }
        if request.method() != Method::Options {
            return Verdict::Actual;
        }
        match request.headers().get_one("Access-Control-Request-Method") {
            None => Verdict::Actual,
            Some(method)
                if ALLOWED_METHODS
                    .iter()
                    .any(|allowed| allowed.as_str() == method) =>
            {
                Verdict::Preflight
            }
            Some(method) => {
                warn!("Rejected a preflight request for the method '{method}' from '{origin}'");
                Verdict::Rejected
            }
        }
    }
}

fn serialize_origin(origin: &str) -> Result<String, InvalidOrigin> {
    match url::Url::parse(origin).map(|url| url.origin()) {
        Ok(parsed @ url::Origin::Tuple(..)) => Ok(parsed.ascii_serialization()),
        _ => Err(InvalidOrigin(origin.to_string())),
    }
}

fn set_allow_origin_headers(request: &Request<'_>, response: &mut Response<'_>) {
    if let Some(origin) = request.headers().get_one("Origin") {
        response.set_raw_header("Access-Control-Allow-Origin", origin.to_string());
    }
    response.set_raw_header("Access-Control-Allow-Credentials", "true");
    response.adjoin_raw_header("Vary", "Origin");
}

#[rocket::async_trait]
impl Fairing for Cors {
    fn info(&self) -> Info {
        Info {
            name: "CORS",
            kind: Kind::Ignite | Kind::Request | Kind::Response,
        }
    }

    async fn on_ignite(&self, rocket: Rocket<Build>) -> rocket::fairing::Result {
        Ok(rocket.mount(
            "/",
            vec![Route::new(Method::Get, REJECTION_PATH, Rejection)],
        ))
    }

    async fn on_request(&self, request: &mut Request<'_>, _: &mut Data<'_>) {
        let verdict = self.judge(request);
        if let Verdict::Rejected = verdict {
            request.set_method(Method::Get);
            request.set_uri(uri!("/cors/rejected"));
        }
        request.local_cache(|| verdict);
    }

    async fn on_response<'r>(&self, request: &'r Request<'_>, response: &mut Response<'r>) {
        match *request.local_cache(|| Verdict::NotCors) {
            Verdict::NotCors | Verdict::Rejected => {}
            Verdict::Actual => {
                set_allow_origin_headers(request, response);
                response.set_raw_header("Access-Control-Expose-Headers", EXPOSED_HEADERS);
            }
            Verdict::Preflight => {
                set_allow_origin_headers(request, response);
                let methods: Vec<&str> = ALLOWED_METHODS
                    .iter()
                    .map(|method| method.as_str())
                    .collect();
                response.set_raw_header("Access-Control-Allow-Methods", methods.join(", "));
                if let Some(headers) = request.headers().get_one("Access-Control-Request-Headers") {
                    response.set_raw_header("Access-Control-Allow-Headers", headers.to_string());
                }
                if request.route().is_none() {
                    response.set_status(Status::NoContent);
                    response.remove_header("Content-Type");
                    let _ = response.body_mut().take();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_origins_are_normalized_to_their_serialization() {
        let cors = Cors::new(["http://localhost:5173/", "https://Example.org:443"]).unwrap();
        assert_eq!(
            cors.allowed_origins,
            HashSet::from(["http://localhost:5173", "https://example.org"].map(String::from))
        );
    }

    #[test]
    fn configured_origins_without_a_host_are_rejected() {
        for origin in ["not an origin", "file:///etc/passwd", ""] {
            assert!(Cors::new([origin]).is_err(), "{origin}");
        }
    }

    #[test]
    fn the_rejection_path_is_the_rerouting_target() {
        assert_eq!(uri!("/cors/rejected").path().as_str(), REJECTION_PATH);
    }
}
