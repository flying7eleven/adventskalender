mod common;

use adventskalender_backend::routes::{
    PickWinnersError, RemoveWinnerError, mark_participant_as_not_won, pick_winners,
};
use common::{TestDatabase, christmas_eve};
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
                    database.picking_user_id,
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
        database.picking_user_id,
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
        database.picking_user_id,
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
                    database.picking_user_id,
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
fn picking_for_an_unknown_user_id_marks_nobody() {
    let database = TestDatabase::start(5);

    let result = rocket::execute(pick_winners(
        &database.pool,
        2,
        christmas_eve(),
        database.picking_user_id + 1,
    ));

    assert!(matches!(result, Err(PickWinnersError::Database(_))));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn removing_a_winner_puts_the_participant_back_into_the_raffle() {
    let database = TestDatabase::start(1);

    let winners = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        database.picking_user_id,
    ))
    .expect("the pick should succeed");

    let result = rocket::execute(mark_participant_as_not_won(
        &database.pool,
        winners[0].id,
        database.picking_user_id,
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
        123456,
        database.picking_user_id,
    ));

    assert!(matches!(result, Err(RemoveWinnerError::UnknownParticipant)));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

fn fail_every_audit_insert(database: &TestDatabase) {
    database.execute(
        "CREATE FUNCTION reject_audit() RETURNS trigger AS $$ \
         BEGIN RAISE EXCEPTION 'audit rejected'; END; $$ LANGUAGE plpgsql",
    );
    database.execute(
        "CREATE TRIGGER reject_audit BEFORE INSERT ON performed_actions \
         FOR EACH ROW EXECUTE FUNCTION reject_audit()",
    );
}

#[test]
fn picking_logs_one_audit_entry_per_winner_with_the_picking_user() {
    let database = TestDatabase::start(2);

    let winners = rocket::execute(pick_winners(
        &database.pool,
        2,
        christmas_eve(),
        database.picking_user_id,
    ))
    .expect("the pick should succeed");

    for winner in winners {
        assert_eq!(
            database.count(&format!(
                "SELECT COUNT(*) AS count FROM performed_actions a JOIN users u ON a.user_id = u.id \
                 WHERE a.action = 'picked_winner' AND u.username = '{}' \
                 AND a.description LIKE '%id {} was%'",
                database.picking_user, winner.id
            )),
            1
        );
    }
}

#[test]
fn a_failing_audit_insert_rolls_back_the_pick() {
    let database = TestDatabase::start(2);
    fail_every_audit_insert(&database);

    let result = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        database.picking_user_id,
    ));

    assert!(matches!(result, Err(PickWinnersError::Database(_))));
    assert_eq!(
        database.count("SELECT COUNT(*) AS count FROM participants WHERE won_on IS NOT NULL"),
        0
    );
}

#[test]
fn a_failing_audit_insert_rolls_back_the_removal_of_a_winner() {
    let database = TestDatabase::start(1);
    let winner_id = rocket::execute(pick_winners(
        &database.pool,
        1,
        christmas_eve(),
        database.picking_user_id,
    ))
    .expect("the pick should succeed")[0]
        .id;
    fail_every_audit_insert(&database);

    let result = rocket::execute(mark_participant_as_not_won(
        &database.pool,
        winner_id,
        database.picking_user_id,
    ));

    assert!(matches!(result, Err(RemoveWinnerError::Database(_))));
    assert_eq!(
        database.count(&format!(
            "SELECT COUNT(*) AS count FROM participants WHERE id = {winner_id} AND won_on IS NOT NULL"
        )),
        1
    );
}
