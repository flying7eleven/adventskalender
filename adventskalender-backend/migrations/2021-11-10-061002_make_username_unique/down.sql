-- drop the constraint we added in this migration
ALTER TABLE users
    DROP CONSTRAINT uq_users_username;