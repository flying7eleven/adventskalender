// @generated automatically by Diesel CLI.

diesel::table! {
    participants (id) {
        id -> Int4,
        first_name -> Varchar,
        last_name -> Varchar,
        won_on -> Nullable<Date>,
        picked_by -> Nullable<Int4>,
        picking_time -> Nullable<Timestamp>,
        can_be_picked -> Bool,
    }
}

diesel::table! {
    performed_actions (id) {
        id -> Int4,
        time_of_action -> Timestamp,
        user_id -> Nullable<Int4>,
        action -> Varchar,
        description -> Nullable<Text>,
    }
}

diesel::table! {
    users (id) {
        id -> Int4,
        username -> Varchar,
        password_hash -> Varchar,
    }
}

diesel::joinable!(participants -> users (picked_by));
diesel::joinable!(performed_actions -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(participants, performed_actions, users,);
