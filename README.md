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
The backend answers a successful login with the username and the remaining token lifetime in seconds, and returns the token as the HTTP-only cookie `auth_token`; only this cookie is accepted, an `Authorization` header is ignored. The token is valid for one hour and can be refreshed until the session reaches its absolute lifetime of 12 hours after the original login, which also bounds a single token.

A logout and a password change end all sessions of the user: every token carries the session epoch of its user, and both bump the epoch, so all previously issued tokens are rejected, also on refresh. The session which changed the password receives a new cookie and stays logged in.

Usernames longer than 64 bytes and passwords longer than 72 bytes (the bcrypt limit) are rejected with `400 Bad Request`, and new passwords longer than 72 bytes are refused. JSON request bodies are limited to 16 KiB. Logins are rate limited to 5 attempts per client IP and 20 attempts per username within 15 minutes; IPv6 clients are grouped by their /64 prefix. The limiter tracks at most 100,000 keys; when it is full and no entry has expired, logins with untracked keys are rate limited until entries expire.

Store the cookie in a cookie jar and pass that jar to all following requests:
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

## Reverse proxy requirement in production
The backend takes the client IP for the login rate limit from the `X-Real-IP` header (via Rocket's `client_ip()`). In production, the backend must therefore only be reachable through the nginx of the frontend container, which proxies `/api/` and `/.well-known/` to the backend and sets this header, since otherwise clients could spoof their IP and bypass the rate limit.

The frontend container runs behind an outer reverse proxy which terminates TLS. This outer proxy must append the client IP to the `X-Forwarded-For` header (e.g. nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). The frontend nginx trusts `X-Forwarded-For` only from peers in the loopback and private ranges `127.0.0.1`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` and `fc00::/7`, takes the rightmost address outside these ranges as the client IP and passes it to the backend as `X-Real-IP`. For any other peer, the peer address itself is the client IP. The outer proxy must therefore reach the frontend container from one of these ranges, and clients within these ranges must not reach the frontend container directly, since they could spoof `X-Forwarded-For`.

## Local diesel usage
For running `diesel` commands locally, create the configuration file first: `cp adventskalender-backend/.env.example adventskalender-backend/.env`.

## Backend configuration
The backend reads its configuration from environment variables and refuses to start if a required variable is missing or empty, or if a value is invalid.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ADVENTSKALENDER_API_HOST` | yes | – | Base URL of the API without a path (e.g. `https://adventskalender.example.com`). It is the issuer of the tokens and the base of the advertised OpenID configuration and JWKS URL. |
| `ADVENTSKALENDER_DB_CONNECTION` | yes | – | PostgreSQL connection URL (e.g. `postgres://user:password@host/adventskalender`). |
| `ADVENTSKALENDER_HEALTHCHECK_IO_PROJECT` | yes | – | UUID of the healthchecks.io check which the health endpoint pings. |
| `ADVENTSKALENDER_TOKEN_AUDIENCE` | yes | – | Comma-separated audience of the issued tokens; incoming tokens must carry one of them. |
| `ADVENTSKALENDER_CORS_ORIGINS` | yes | – | Comma-separated origins (scheme, host and port, e.g. `https://adventskalender.example.com`) which may call the API. |
| `ADVENTSKALENDER_COOKIE_SECURE` | no | `true` | `true` or `false`; whether the `auth_token` cookie carries the `Secure` attribute. Set it to `false` only for local setups served over plain HTTP. |
| `ADVENTSKALENDER_KEY_FILE_PATH` | no | `/data/adventskalender_ed25519.key` | Location of the token signing key, see below. |
| `ADVENTSKALENDER_LOGGING_LEVEL` | no | `info` | One of `trace`, `debug`, `info`, `warn` or `error`. |

`ADVENTSKALENDER_CORS_ORIGINS` doubles as the CSRF protection: the backend rejects every request whose `Origin` header is not listed with `403 Forbidden`. Browsers send `Origin` also on same-origin `POST`, `PUT` and `DELETE` requests, so the list must contain the public origin under which the frontend is served, otherwise the login and every change fail.

Release builds of the backend send `Strict-Transport-Security: max-age=31536000` on every response, without `includeSubDomains` and `preload`.

## Token signing key
The backend signs its tokens with an Ed25519 key in the PKCS#8 DER format stored at `ADVENTSKALENDER_KEY_FILE_PATH`. Only if the file does not exist, the backend generates a new key on startup and stores it there with permissions for the owner only; the key is written to a temporary file next to it and renamed into place, so an interrupted start never leaves a partial key behind. If the file exists but cannot be read or does not contain a valid key (e.g. a PEM file or wrong permissions), the backend refuses to start and leaves the file untouched. Keep the file on a persistent volume, since a new key invalidates all previously issued tokens.
