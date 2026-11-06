# Adventskalender (Swedish for _advent calendar_)
[![Build and test backend](https://github.com/flying7eleven/adventskalender/actions/workflows/build_backend.yml/badge.svg)](https://github.com/flying7eleven/adventskalender/actions/workflows/build_backend.yml)
[![Build and test frontend](https://github.com/flying7eleven/adventskalender/actions/workflows/build_frontend.yml/badge.svg)](https://github.com/flying7eleven/adventskalender/actions/workflows/build_frontend.yml)
[![MIT License](http://img.shields.io/badge/license-MIT-9370d8.svg?style=flat)](http://opensource.org/licenses/MIT)

This repository contains a quite simple setup for running a raffle for the first twenty-four days of
december (advent calender-like). Therefore, a list of names is stored in a database from which a
number of people are randomly selected for a day as winners.

## Building and running it locally
1. Build the backend container by going into the root directory of the repository and typing the following command: `docker buildx build -f adventskalender-backend/Dockerfile -t adventskalender-backend:local .`
2. Build the frontend container by going into the root directory of the repository and typing the following command: `docker buildx build -t adventskalender-frontend:local adventskalender-frontend`
3. Type `docker-compose up -d` for stating up the debug database and the backend which connects to it
4. Import `adventskalender-backend/example_data.sql` to the database used by the backend

## Running the tests
The backend tests start their own PostgreSQL container, so Docker must be running before calling `cargo test` in `adventskalender-backend`.

## Authenticate against the backend
The backend returns the token as the HTTP-only cookie `auth_token`. Store it in a cookie jar and pass that jar to all following requests:
```shell
curl --cookie-jar cookies.txt --header "Content-Type: application/json" --request POST --data '{"username":"demouser","password":"demopassword"}' http://localhost:5479/v1/auth/token
curl --cookie cookies.txt http://localhost:5479/v1/participants/count
```

## Create a password hash for database users
The application uses bcrypt with a cost factor of 10 to hash passwords. To create a new user or update an existing user's password in the database, you need to generate a bcrypt hash.

### Using Python
```shell
python3 -c "import bcrypt; print(bcrypt.hashpw(b'your_password_here', bcrypt.gensalt(rounds=10)).decode())"
```

If bcrypt is not installed, install it first:
```shell
pip3 install bcrypt
```

### Using htpasswd (if available)
```shell
htpasswd -nbB -C 10 username your_password_here | cut -d: -f2
```

### Example
To create a user with username `admin` and password `SecurePassword123`:
```shell
# Generate the hash
python3 -c "import bcrypt; print(bcrypt.hashpw(b'SecurePassword123', bcrypt.gensalt(rounds=10)).decode())"

# Insert into database (example output: $2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy)
psql -h localhost -U adventskalender -d adventskalender -c \
  "INSERT INTO users (username, password_hash) VALUES ('admin', '\$2b\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');"
```

**Note**: The example hash above is for demonstration only. Always generate a fresh hash for your actual password.

## Token signing key
The backend signs its tokens with an Ed25519 key stored at `ADVENTSKALENDER_KEY_FILE_PATH` (default `/data/adventskalender_ed25519.key`). If the file is missing or invalid, the backend generates a new key on startup and stores it there, which invalidates all previously issued tokens. Keep the file on a persistent volume.

## Things still to do
- [x] _Backend_: Ensure that there can not be two parallel requests for picking winners
- [x] _Backend_: Use the new string formatting literals
- [x] _Frontend_: Have a better looking overview for the calendar view
- [x] _Frontend_: Removing a winner re-sorts the remaining winners in the cards. Always order them alphabetically to prevent this
- [x] _Frontend_: A warning if the user tries to pick winners for a day, where winners were already picked
- [x] _Front- and Backend_: Use the correct semantics for the REST routes
- [x] _Front- and Backend_: Be able to change the own password on a settings page
