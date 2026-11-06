use adventskalender_backend::fairings::AdventskalenderDatabaseConnection;
use adventskalender_backend::routes::{pick_winners, PickWinnersError};
use chrono::NaiveDate;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sql_types::{BigInt, Integer};
use diesel::{sql_query, PgConnection, QueryableByName, RunQueryDsl};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::collections::HashSet;
use std::sync::{Arc, Barrier};
use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::testcontainers::runners::SyncRunner;
use testcontainers_modules::testcontainers::Container;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");
const PICKING_USER: &str = "picker";

struct TestDatabase {
    pool: AdventskalenderDatabaseConnection,
    raw_pool: Pool<ConnectionManager<PgConnection>>,
    _container: Container<Postgres>,
}

#[derive(QueryableByName)]
struct Count {
    #[diesel(sql_type = BigInt)]
    count: i64,
}

fn start_database(number_of_participants: i32) -> TestDatabase {
    let container = Postgres::default()
        .start()
        .expect("Docker is required to run the database tests");
    let url = format!(
        "postgres://postgres:postgres@{}:{}/postgres",
        container.get_host().unwrap(),
        container.get_host_port_ipv4(5432).unwrap()
    );
    let raw_pool = Pool::builder()
        .max_size(16)
        .build(ConnectionManager::<PgConnection>::new(url))
        .unwrap();

    let connection = &mut raw_pool.get().unwrap();
    connection.run_pending_migrations(MIGRATIONS).unwrap();
    sql_query("INSERT INTO users (username, password_hash) VALUES ($1, 'unused')")
        .bind::<diesel::sql_types::Text, _>(PICKING_USER)
        .execute(connection)
        .unwrap();
    sql_query(
        "INSERT INTO participants (first_name, last_name) \
         SELECT 'First' || n, 'Last' || n FROM generate_series(1, $1) AS n",
    )
    .bind::<Integer, _>(number_of_participants)
    .execute(connection)
    .unwrap();

    TestDatabase {
        pool: AdventskalenderDatabaseConnection::from(raw_pool.clone()),
        raw_pool,
        _container: container,
    }
}

fn count(database: &TestDatabase, query: &str) -> i64 {
    sql_query(query)
        .get_result::<Count>(&mut database.raw_pool.get().unwrap())
        .unwrap()
        .count
}

fn christmas_eve() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 12, 24).unwrap()
}

#[test]
fn parallel_picks_never_select_the_same_participant_twice() {
    const PARALLEL_PICKS: usize = 10;
    const WINNERS_PER_PICK: usize = 3;
    let database = Arc::new(start_database((PARALLEL_PICKS * WINNERS_PER_PICK) as i32));
    let barrier = Arc::new(Barrier::new(PARALLEL_PICKS));

    let picks: Vec<_> = (0..PARALLEL_PICKS)
        .map(|_| {
            let database = Arc::clone(&database);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                rocket::execute(pick_winners(
                    &database.pool,
                    WINNERS_PER_PICK,
                    christmas_eve(),
                    PICKING_USER,
                ))
            })
        })
        .collect();

    let mut winner_ids = HashSet::new();
    for pick in picks {
        let winners = pick.join().unwrap().expect("every pick should succeed");
        assert_eq!(winners.len(), WINNERS_PER_PICK);
        for winner in winners {
            assert!(
                winner_ids.insert(winner.id),
                "participant {} was picked twice",
                winner.id
            );
        }
    }
    assert_eq!(
        count(
            &database,
            "SELECT COUNT(*) AS count FROM participants p JOIN users u ON p.picked_by = u.id \
             WHERE p.won_on = DATE '2026-12-24' AND u.username = 'picker'"
        ),
        (PARALLEL_PICKS * WINNERS_PER_PICK) as i64
    );
}

#[test]
fn picking_more_winners_than_participants_left_marks_nobody() {
    let database = start_database(2);

    let result = rocket::execute(pick_winners(
        &database.pool,
        3,
        christmas_eve(),
        PICKING_USER,
    ));

    assert!(matches!(
        result,
        Err(PickWinnersError::NotEnoughParticipants)
    ));
    assert_eq!(
        count(
            &database,
            "SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"
        ),
        0
    );
}

#[test]
fn picking_for_an_unknown_user_marks_nobody() {
    let database = start_database(5);

    let result = rocket::execute(pick_winners(&database.pool, 2, christmas_eve(), "unknown"));

    assert!(matches!(result, Err(PickWinnersError::UnknownUser)));
    assert_eq!(
        count(
            &database,
            "SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"
        ),
        0
    );
}
