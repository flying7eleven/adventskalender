use rocket::Request;
use rocket::request::{FromRequest, Outcome};

/// The client IP of the request, honouring the reverse proxy's `X-Real-IP` header via Rocket's
/// `client_ip()`.
pub struct ClientIp(pub Option<std::net::IpAddr>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ClientIp {
    type Error = std::convert::Infallible;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        Outcome::Success(ClientIp(request.client_ip()))
    }
}

/// The representation of an authenticated user. As soon as this is included in the parameters
/// of a route, the call can only be made with a valid, unrevoked token in the `auth_token`
/// cookie.
pub struct AuthenticatedUser {
    pub user_id: i32,
    pub username: String,
    /// The session epoch the token was issued for, which equals the user's current epoch.
    pub session_epoch: i32,
    /// The UNIX timestamp (in seconds) at which the validated token expires.
    pub expires_at: u64,
    /// The UNIX timestamp (in seconds) of the original login of the session, preserved across
    /// refreshs so that the absolute session lifetime can be enforced.
    pub auth_time: u64,
}

#[derive(Debug)]
pub enum AuthorizationError {
    /// The request carries no `auth_token` cookie.
    MissingToken,
    /// The supplied token is not valid (e.g. the signature validation failed or it expired).
    InvalidToken,
    /// The token was revoked by a logout or a password change, or its user does not exist
    /// anymore.
    RevokedToken,
    /// We failed to validate the token (e.g. we do not know if the token is valid or not).
    CannotValidateToken,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AuthenticatedUser {
    type Error = AuthorizationError;

    async fn from_request(
        request: &'r Request<'_>,
    ) -> Outcome<AuthenticatedUser, AuthorizationError> {
        use crate::Claims;
        use crate::fairings::{AdventskalenderDatabaseConnection, BackendConfiguration};
        use crate::schema::users::dsl::{id, session_epoch, username, users};
        use diesel::{ExpressionMethods, OptionalExtension, QueryDsl, RunQueryDsl};
        use jsonwebtoken::decode;
        use jsonwebtoken::errors::ErrorKind;
        use log::{debug, error, warn};
        use rocket::http::Status;

        let Some(token_cookie) = request.cookies().get("auth_token") else {
            debug!("The request carries no auth_token cookie");
            return Outcome::Error((Status::Forbidden, AuthorizationError::MissingToken));
        };

        let rocket = request.rocket();
        let (Some(backend_config), Some(database)) = (
            rocket.state::<BackendConfiguration>(),
            rocket.state::<AdventskalenderDatabaseConnection>(),
        ) else {
            error!("The backend configuration or the database is missing from the managed state");
            return Outcome::Error((
                Status::InternalServerError,
                AuthorizationError::CannotValidateToken,
            ));
        };

        let claims = match decode::<Claims>(
            token_cookie.value(),
            &backend_config.decoding_key,
            &backend_config.token_validation,
        ) {
            Ok(token) => token.claims,
            Err(error) => {
                if matches!(error.kind(), ErrorKind::ExpiredSignature) {
                    debug!("The supplied token has expired");
                } else {
                    warn!("The supplied token is invalid. The error was: {error}");
                }
                return Outcome::Error((Status::Forbidden, AuthorizationError::InvalidToken));
            }
        };

        let subject = claims.sub.clone();
        let current_user = database
            .run_blocking(move |db_connection| {
                users
                    .filter(username.eq(&subject))
                    .select((id, session_epoch))
                    .first::<(i32, i32)>(db_connection)
                    .optional()
            })
            .await;
        let user_id = match current_user {
            Ok(Ok(Some((user_id, current_epoch)))) if current_epoch == claims.session_epoch => {
                user_id
            }
            Ok(Ok(Some(_))) => {
                debug!("The supplied token was revoked by a logout or a password change");
                return Outcome::Error((Status::Forbidden, AuthorizationError::RevokedToken));
            }
            Ok(Ok(None)) => {
                warn!(
                    "The supplied token belongs to the user '{}' who does not exist anymore",
                    claims.sub
                );
                return Outcome::Error((Status::Forbidden, AuthorizationError::RevokedToken));
            }
            Ok(Err(error)) => {
                error!("Could not look up the session epoch of a user. The error was: {error}");
                return Outcome::Error((
                    Status::InternalServerError,
                    AuthorizationError::CannotValidateToken,
                ));
            }
            Err(error) => {
                error!("Could not look up the session epoch of a user. The error was: {error}");
                return Outcome::Error((
                    Status::InternalServerError,
                    AuthorizationError::CannotValidateToken,
                ));
            }
        };

        Outcome::Success(AuthenticatedUser {
            user_id,
            username: claims.sub,
            session_epoch: claims.session_epoch,
            expires_at: claims.exp as u64,
            auth_time: claims.auth_time as u64,
        })
    }
}
