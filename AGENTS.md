# Agent contribution guide

## Before making a change

1. Read `README.md` and `docs/architecture.md`.
2. Keep changes small, focused, and reviewable.
3. Do not change branch protection, Actions permissions, or repository secrets
   unless the task explicitly requests it.

## Quality gate

- Run the documented test command when the project has one.
- Update or add tests with behavior changes.
- Keep documentation accurate when project structure or delivery behavior changes.
- Never commit credentials, API keys, generated secrets, or local environment files.

## Protected areas

- `.github/` changes require careful review because they control CI and updates.
- `AGENTS.md` and `docs/architecture.md` are source-of-truth guidance for
  humans and coding agents.
