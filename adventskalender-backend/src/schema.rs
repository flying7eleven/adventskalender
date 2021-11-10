table! {
    participants (id) {
        id -> Int4,
        first_name -> Varchar,
        last_name -> Varchar,
        won_on -> Nullable<Date>,
        picked_by -> Nullable<Varchar>,
        picking_time -> Nullable<Timestamp>,
    }
}

table! {
    users (id) {
        id -> Int4,
        username -> Varchar,
        password_hash -> Varchar,
    }
}

allow_tables_to_appear_in_same_query!(participants, users,);
