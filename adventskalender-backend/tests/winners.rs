mod common;

use adventskalender_backend::routes::{
    mark_participant_as_not_won, pick_winners, PickWinnersError, RemoveWinnerError,
};
use common::{christmas_eve, TestDatabase};
use std::collections::HashSet;
use std::sync::{Arc, Barrier};

#[test]
fn parallel_picks_never_select_the_same_participant_twice() {
    const PARALLEL_PICKS: usize = 10;
    const WINNERS_PER_PICK: usize = 3;
    let database = Arc::new(TestDatabase::start(
        (PARALLEL_PICKS * WINNERS_PER_PICK) as i32,
    ));
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
                    &database.picking_user,
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
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants p JOIN users u ON p.picked_by = u.id \
             WHERE p.won_on = DATE '2026-12-24' AND u.username = '{}'",
            database.picking_user
        )),
        (PARALLEL_PICKS * WINNERS_PER_PICK) as i64
    );
}

#[test]
fn picking_more_winners_than_participants_left_marks_nobody() {
    let database = TestDatabase::start(2);

    let result = rocket::execute(pick_winners(
        &database.pool,
        3,
        christmas_eve(),
        &database.picking_user,
    ));

    assert!(matches!(
        result,
        Err(PickWinnersError::NotEnoughParticipants)
    ));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn picking_for_an_unknown_user_marks_nobody() {
    let database = TestDatabase::start(5);

    let result = rocket::execute(pick_winners(&database.pool, 2, christmas_eve(), "unknown"));

    assert!(matches!(result, Err(PickWinnersError::UnknownUser)));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn removing_a_winner_puts_the_participant_back_into_the_raffle() {
    let database = TestDatabase::start(1);
    let winner = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        &database.picking_user,
    ))
    .unwrap()
    .remove(0);

    let result = rocket::execute(mark_participant_as_not_won(
        &database.pool,
        winner.id,
        database.picking_user.clone(),
    ));

    assert!(result.is_ok());
    assert_eq!(
        database.count(
            "SELECT COUNT(*) AS count FROM participants \
             WHERE won_on IS NULL AND picked_by IS NULL AND picking_time IS NULL"
        ),
        1
    );
}

#[test]
fn removing_an_unknown_participant_reports_it_as_unknown() {
    let database = TestDatabase::start(1);

    let result = rocket::execute(mark_participant_as_not_won(
        &database.pool,
        4711,
        database.picking_user.clone(),
    ));

    assert!(matches!(result, Err(RemoveWinnerError::UnknownParticipant)));
}

#[test]
fn picking_reports_database_errors_instead_of_an_unknown_user() {
    let database = TestDatabase::start(1);
    database.execute("ALTER TABLE users RENAME TO unreadable_users");

    let result = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        &database.picking_user,
    ));

    assert!(matches!(result, Err(PickWinnersError::Database(_))));
}
