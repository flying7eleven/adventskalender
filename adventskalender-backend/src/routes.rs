mod audit;
mod auth;
mod meta;
mod participants;

pub use audit::*;
pub use auth::*;
pub use meta::*;
pub use participants::*;

use rocket::{Build, Rocket, routes};

/// Mounts all routes of the backend below their base paths.
pub fn mount_routes(rocket: Rocket<Build>) -> Rocket<Build> {
    rocket
        .mount("/.well-known", routes![get_openid_configuration, get_jwks])
        .mount(
            "/v1",
            routes![
                get_login_token,
                logout,
                refresh_session,
                get_current_user,
                get_number_of_participants_who_already_won,
                pick_multiple_random_participant_from_raffle_list,
                get_all_won_participants,
                count_won_participants_on_day,
                update_participant_values,
                remove_participant_from_winner_list,
                check_backend_health,
                get_backend_version,
                update_user_password,
                get_audit_event_count,
                get_won_participants_on_day_route,
            ],
        )
}
