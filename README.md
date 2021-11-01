# Adventskalender (Swedish for _advent calendar_)
[![Build and test backend](https://github.com/flying7eleven/adventskalender/actions/workflows/build_backend.yml/badge.svg)](https://github.com/flying7eleven/adventskalender/actions/workflows/build_backend.yml)
[![MIT License](http://img.shields.io/badge/license-MIT-9370d8.svg?style=flat)](http://opensource.org/licenses/MIT)

This repository contains a quite simple setup for running a raffle for the first twenty-four days of
december (advent calender-like). Therefore, a list of names is stored in a database from which a
number of people are randomly selected for a day as winners.

## Building and running it locally
1. Build the backend container by going into the root directory of the repository and typing the following command: `docker buildx build -f adventskalender-backend/Dockerfile -t adventskalender-backend:local .`
2. Type `docker-compose up -d` for stating up the debug database and the backend which connects to it
3. Import `adventskalender-backend/example_data.sql` to the database used by the backend