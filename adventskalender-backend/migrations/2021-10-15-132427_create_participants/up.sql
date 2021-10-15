-- the table which will hold the possible participants
CREATE TABLE participants
(
    id         INTEGER UNIQUE NOT NULL PRIMARY KEY,
    first_name VARCHAR(32)    NOT NULL,
    last_name  VARCHAR(32)    NOT NULL,
    won_on     DATE DEFAULT NULL
);

-- the combination of first and last name should be unique for the participants
CREATE UNIQUE INDEX participants_unique_name ON participants (first_name, last_name);