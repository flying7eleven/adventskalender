-- remove the new fields we added in this migration
ALTER TABLE participants
    DROP COLUMN present_identifier;