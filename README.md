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

## Get an access token for the backend
Just use `curl --verbose --header "Content-Type: application/json" --request POST --data '{"username":"demouser","password":"demopassword"}'  http://localhost:5479/auth/token` for getting a corresponding token
