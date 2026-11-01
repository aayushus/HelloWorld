# Architecture overview

## Current state

This repository is intentionally a minimal starter project. It currently has no
application runtime, package manifest, or automated test suite.

## Delivery boundaries

- `main` is the protected integration branch.
- Pull requests are the only path for production changes.
- GitHub Actions validates repository hygiene and documentation links.
- Dependabot keeps GitHub Actions dependencies current.

## When application code is added

1. Put source code in a named top-level directory such as `src/`.
2. Put automated tests in the ecosystem-standard location and document the
   canonical command in `README.md`.
3. Add a coverage reporter to CI before treating coverage as a readiness score.
4. Add test analytics or a flaky-test signal before reporting flaky-test health.
