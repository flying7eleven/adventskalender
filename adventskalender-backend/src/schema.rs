// @generated automatically by Diesel CLI.

diesel::table! {
    participants (id) {
        id -> Int4,
        #[max_length = 32]
        first_name -> Varchar,
        #[max_length = 32]
        last_name -> Varchar,
        won_on -> Nullable<Date>,
        picked_by -> Nullable<Int4>,
        picking_time -> Nullable<Timestamp>,
        #[max_length = 1]
        present_identifier -> Nullable<Varchar>,
    }
}

diesel::table! {
    performed_actions (id) {
        id -> Int4,
        time_of_action -> Timestamp,
        user_id -> Nullable<Int4>,
        #[max_length = 32]
        action -> Varchar,
        description -> Nullable<Text>,
    }
}

diesel::table! {
    users (id) {
        id -> Int4,
        #[max_length = 64]
        username -> Varchar,
        #[max_length = 255]
        password_hash -> Varchar,
    }
}

diesel::joinable!(participants -> users (picked_by));
diesel::joinable!(performed_actions -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(participants, performed_actions, users,);
