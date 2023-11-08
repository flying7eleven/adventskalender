-- add fields for storing the present identifier for each winner
ALTER TABLE participants
    ADD COLUMN present_identifier VARCHAR(1) DEFAULT NULL;
