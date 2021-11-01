-- add some example /demo users for the participants
INSERT INTO participants VALUES (DEFAULT, 'First', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Second', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Third', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Fourth', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Fifth', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Sixth', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Seventh', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Eighth', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Nineth', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Tenth', 'User', NULL);
INSERT INTO participants VALUES (DEFAULT, 'Won', 'User', '2021-11-01');

-- insert the demo users for authentication
INSERT INTO users VALUES (DEFAULT, 'demouser', '$2y$16$0Fw5t3TfqCSByFlxOxWCLOfrbUnMlbDJuxC6G11RvHy01FSWN5b4C'); -- demopassword