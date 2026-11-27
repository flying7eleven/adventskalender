# AGENTS.md

## Dependency upgrades

- Backend: `cargo-edit` is installed. Run `cargo upgrade --incompatible` in `adventskalender-backend` to raise the requirements in `Cargo.toml` to the latest versions, then `cargo update` for the lockfile.
- Frontend: keep `typescript` on 6.x. TypeScript 7 (the native Go port) lacks the JavaScript compiler API that typescript-eslint needs, so `npm run lint` breaks on it.

## Tests and commits

- The pre-commit hook runs the frontend lint, format check, `npm audit` and tests for every commit, backend-only commits included. A fresh checkout or worktree needs `npm ci` in `adventskalender-frontend` before its first commit.
- Backend tests start PostgreSQL through Testcontainers, so Docker must be running. Run them with `cargo test --no-fail-fast`. Several checkouts testing at once can cause `PortNotExposed` or pool connection errors; rerun the failing test target.
- Picks are only valid for December 1–24 of the current year. Build test dates with the current-year helpers in `adventskalender-backend/tests/common/mod.rs`, never with fixed years.
