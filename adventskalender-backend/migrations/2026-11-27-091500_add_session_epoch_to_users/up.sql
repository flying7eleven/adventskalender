-- Every token carries the session epoch of its user at issuing time. Bumping the epoch (on logout
-- and on a password change) invalidates all tokens issued before.
ALTER TABLE users
    ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0;
