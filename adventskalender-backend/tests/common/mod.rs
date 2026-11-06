// every integration test crate compiles this module, but not every crate uses all helpers
#![allow(dead_code)]

use adventskalender_backend::fairings::AdventskalenderDatabaseConnection;
use chrono::NaiveDate;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sql_types::{BigInt, Integer, Text};
use diesel::{sql_query, PgConnection, QueryableByName, RunQueryDsl};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::sync::atomic::{AtomicUsize, Ordering};
use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::testcontainers::runners::SyncRunner;
use testcontainers_modules::testcontainers::Container;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/");
pub const PICKING_USER_PASSWORD: &str = "picker-password";
static CREATED_DATABASES: AtomicUsize = AtomicUsize::new(0);

pub struct TestDatabase {
    pub pool: AdventskalenderDatabaseConnection,
    /// Unique per database, since the login rate limiter is process-wide and keyed by username.
    pub picking_user: String,
    raw_pool: Pool<ConnectionManager<PgConnection>>,
    _container: Container<Postgres>,
}

#[derive(QueryableByName)]
struct Count {
    #[diesel(sql_type = BigInt)]
    count: i64,
}

impl TestDatabase {
    pub fn start(number_of_participants: i32) -> TestDatabase {
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

        let picking_user = format!(
            "picker-{}",
            CREATED_DATABASES.fetch_add(1, Ordering::Relaxed)
        );
        let connection = &mut raw_pool.get().unwrap();
        connection.run_pending_migrations(MIGRATIONS).unwrap();
        sql_query("INSERT INTO users (username, password_hash) VALUES ($1, $2)")
            .bind::<Text, _>(&picking_user)
            .bind::<Text, _>(bcrypt::hash(PICKING_USER_PASSWORD, 4).unwrap())
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
            picking_user,
            raw_pool,
            _container: container,
        }
    }

    pub fn new_connection_pool(&self) -> AdventskalenderDatabaseConnection {
        AdventskalenderDatabaseConnection::from(self.raw_pool.clone())
    }

    pub fn count(&self, query: &str) -> i64 {
        sql_query(query)
            .get_result::<Count>(&mut self.raw_pool.get().unwrap())
            .unwrap()
            .count
    }

    pub fn execute(&self, statement: &str) {
        sql_query(statement)
            .execute(&mut self.raw_pool.get().unwrap())
            .unwrap();
    }
}

pub fn christmas_eve() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 12, 24).unwrap()
}
