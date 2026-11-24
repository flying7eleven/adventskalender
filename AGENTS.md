# AGENTS.md

## Dependency upgrades

- Backend: `cargo-edit` is installed. Run `cargo upgrade --incompatible` in `adventskalender-backend` to raise the requirements in `Cargo.toml` to the latest versions, then `cargo update` for the lockfile.
- Frontend: keep `typescript` on 6.x. TypeScript 7 (the native Go port) lacks the JavaScript compiler API that typescript-eslint needs, so `npm run lint` breaks on it.
