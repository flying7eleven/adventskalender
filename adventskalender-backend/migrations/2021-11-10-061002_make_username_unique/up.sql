-- ensure the username is always unique
ALTER TABLE users
    ADD CONSTRAINT uq_users_username UNIQUE (username);