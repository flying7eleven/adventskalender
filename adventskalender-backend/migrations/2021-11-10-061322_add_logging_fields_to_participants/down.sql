-- remove the foreign key we added in this migration
ALTER TABLE participants
    DROP CONSTRAINT fk_users_username;

-- remove the new fields we added in this migration
ALTER TABLE participants
    DROP COLUMN picked_by;
ALTER TABLE participants
    DROP COLUMN picking_time;