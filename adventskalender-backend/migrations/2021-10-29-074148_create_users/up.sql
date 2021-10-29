-- the table which will hold the possible users and their passwords
CREATE TABLE participants
(
    id            INTEGER UNIQUE NOT NULL PRIMARY KEY,
    username      VARCHAR(64)    NOT NULL,
    password_hash VARCHAR(255)   NOT NULL
);
