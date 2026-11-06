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
        .enumerate()
        .map(|(index, _)| {
            let database = Arc::clone(&database);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                rocket::execute(pick_winners(
                    &database.pool,
                    WINNERS_PER_PICK,
                    christmas_eve() + chrono::Duration::days(index as i64),
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
             WHERE u.username = '{}'",
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
fn picking_more_winners_than_the_day_allows_marks_nobody() {
    let database = TestDatabase::start(7);

    let result = rocket::execute(pick_winners(
        &database.pool,
        adventskalender_backend::routes::MAX_WINNERS_PER_DAY + 1,
        christmas_eve(),
        &database.picking_user,
    ));

    assert!(matches!(
        result,
        Err(PickWinnersError::TooManyWinnersForDay)
    ));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn parallel_picks_never_exceed_the_maximum_number_of_winners_per_day() {
    const PARALLEL_PICKS: usize = 10;
    const WINNERS_PER_PICK: usize = 1;
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

    let mut total_winners = 0;
    for pick in picks {
        match pick.join().unwrap() {
            Ok(winners) => total_winners += winners.len(),
            Err(PickWinnersError::TooManyWinnersForDay) => {}
            Err(error) => panic!("unexpected pick error: {error:?}"),
        }
    }
    assert_eq!(
        total_winners,
        adventskalender_backend::routes::MAX_WINNERS_PER_DAY
    );
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        adventskalender_backend::routes::MAX_WINNERS_PER_DAY as i64
    );
}

#[test]
fn picking_reports_database_errors_instead_of_an_unknown_user() {
    let database = TestDatabase::start(1);
    database.execute("ALTER TABLE participants RENAME TO renamed_participants");

    let result = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        &database.picking_user,
    ));

    assert!(matches!(result, Err(PickWinnersError::Database(_))));
}

#[test]
fn removing_a_winner_puts_the_participant_back_into_the_raffle() {
    let database = TestDatabase::start(1);

    let winners = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        &database.picking_user,
    ))
    .expect("the pick should succeed");

    let result = rocket::execute(mark_participant_as_not_won(
        &database.pool,
        winners[0].id,
        database.picking_user.clone(),
    ));

    assert!(result.is_ok());
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn removing_an_unknown_participant_reports_it_as_unknown() {
    let database = TestDatabase::start(1);

    let result = rocket::execute(mark_participant_as_not_won(
        &database.pool,
        123456,
        database.picking_user.clone(),
    ));

    assert!(matches!(result, Err(RemoveWinnerError::UnknownParticipant)));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}
