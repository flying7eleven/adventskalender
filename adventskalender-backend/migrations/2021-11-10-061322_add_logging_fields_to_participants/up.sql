-- add fields for logging by whom and when a user was picked
ALTER TABLE participants
    ADD COLUMN picked_by VARCHAR(64);
ALTER TABLE participants
    ADD COLUMN picking_time TIMESTAMP;

-- add the constraint to the user table which handles the username
ALTER TABLE participants
    ADD CONSTRAINT fk_users_username FOREIGN KEY (picked_by) REFERENCES users (username);