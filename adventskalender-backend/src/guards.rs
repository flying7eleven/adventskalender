use rocket::request::{FromRequest, Outcome};
use rocket::Request;

/// The representation of an authenticated user. As soon as this is included in the parameters
/// of a route, the call can be just made with an valid token in the header.
pub struct AuthenticatedUser {
    pub username: String,
}

#[derive(Debug)]
pub enum AuthorizationError {
    /// Could not find any authentication header in the request.
    MissingAuthorizationHeader,
    /// It seems that the authentication header is not well-formed (e.g. Bearer is missing)
    MalformedAuthorizationHeader,
    /// It seems that the supplied token is not valid (e.g. signature validation failed)
    InvalidToken,
    /// It seems that we failed to validate the token (e.g. we do not know if the token is valid or not)
    CannotValidateToken,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AuthenticatedUser {
    type Error = AuthorizationError;

    async fn from_request(
        request: &'r Request<'_>,
    ) -> Outcome<AuthenticatedUser, AuthorizationError> {
        use crate::fairings::BackendConfiguration;
        use crate::Claims;
        use jsonwebtoken::{decode, Algorithm, Validation};
        use log::error;
        use rocket::http::Status;

        // Try to get token from cookie first, then fall back to Authorization header
        let cookies = request.cookies();
        let token_str = match cookies.get("auth_token") {
            Some(cookie) => cookie.value().to_string(),
            None => {
                // Fallback: try to get from Authorization header for backward compatibility
                match request.headers().get_one("Authorization") {
                    Some(maybe_authorization) => {
                        // split the token type from the actual token... there have to be two parts
                        let authorization_information =
                            maybe_authorization.split(' ').collect::<Vec<&str>>();
                        if authorization_information.len() != 2 {
                            error!("It seems that the authorization header is malformed. There were 2 parts expected but we got {}", authorization_information.len());
                            return Outcome::Error((
                                Status::Forbidden,
                                AuthorizationError::MalformedAuthorizationHeader,
                            ));
                        }

                        // ensure that the token type is marked as 'bearer' token
                        if authorization_information[0].to_lowercase() != "bearer" {
                            error!("It seems that the authorization header is malformed. We expected as token type 'bearer' but got '{}'", authorization_information[0].to_lowercase());
                            return Outcome::Error((
                                Status::Forbidden,
                                AuthorizationError::MalformedAuthorizationHeader,
                            ));
                        }

                        authorization_information[1].to_string()
                    }
                    None => {
                        error!("No authentication token found in cookie or Authorization header!");
                        return Outcome::Error((
                            Status::Forbidden,
                            AuthorizationError::MissingAuthorizationHeader,
                        ));
                    }
                }
            }
        };

        // get the current backend configuration for the token signature psk
        let backend_config = request.rocket().state::<BackendConfiguration>().map_or(
            BackendConfiguration {
                api_host: "".to_string(),
                encoding_key: None,
                decoding_key: None,
                ed25519_key_bytes: None,
                healthcheck_project: "".to_string(),
                token_audience: [].into(),
            },
            |config| config.clone(),
        );

        // specify the parameter for the validation of the token
        let mut validation_parameter = Validation::new(Algorithm::EdDSA);
        validation_parameter.leeway = 5; // allow a time difference of max. 5 seconds
        validation_parameter.validate_exp = true;
        validation_parameter.validate_nbf = true;
        validation_parameter.validate_aud = true;
        validation_parameter.aud = Some(backend_config.token_audience.clone());

        // set issuer for validation
        let mut issuer_set = std::collections::HashSet::new();
        issuer_set.insert(backend_config.api_host.clone());
        validation_parameter.iss = Some(issuer_set);

        // verify the validity of the token supplied in the header or cookie
        let decoded_token = match decode::<Claims>(
            &token_str,
            &backend_config.decoding_key.unwrap(),
            &validation_parameter,
        ) {
            Ok(token) => token,
            Err(error) => {
                error!(
                    "The supplied token seems to be invalid. The error was: {}",
                    error
                );
                return Outcome::Error((Status::Forbidden, AuthorizationError::InvalidToken));
            }
        };

        // if we reach this step, the validation was successful, and we can allow the user to
        // call the route
        Outcome::Success(AuthenticatedUser {
            username: decoded_token.claims.sub,
        })
    }
}
