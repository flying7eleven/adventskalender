-- add fields for logging by whom and when a user was picked
ALTER TABLE participants
    ADD COLUMN picked_by INT4 REFERENCES users (id);
ALTER TABLE participants
    ADD COLUMN picking_time TIMESTAMP;