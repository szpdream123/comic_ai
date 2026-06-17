# Project Agent Notes

## Runtime Connections

- Always read connection settings from the project's `.env` before connecting to runtime services such as PostgreSQL, Redis, object storage, SMS, model providers, or local dev servers.
- Treat `.env` as the source of truth for host, port, database name, credentials, and feature flags. Do not substitute guessed defaults when a configured value is present.
- PostgreSQL connections must use the formal `.env` `DATABASE_URL` directly. Do not prefer or substitute `TEST_DATABASE_URL` for local startup, debugging, QA, or verification runs.
- When starting the project, do not run separate preflight checks for `.env` connection values. Start directly with the configured `.env` values to keep startup fast.
- If the runtime connection fails during startup or use, stop and report the exact service and `.env` key involved instead of silently falling back to another endpoint.
- Do not print secrets from `.env`; redact credentials and tokens in logs or user-facing output.
