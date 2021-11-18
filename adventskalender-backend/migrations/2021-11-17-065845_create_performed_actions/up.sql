-- create a table which holds all
CREATE TABLE performed_actions
(
    id             SERIAL PRIMARY KEY,
    time_of_action TIMESTAMP   NOT NULL,
    user_id        INT4 REFERENCES users (id),
    action         VARCHAR(32) NOT NULL,
    description    TEXT DEFAULT NULL
);
