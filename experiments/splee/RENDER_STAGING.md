# Render staging deployment runbook

Status: **not deployed**. This document records the upstream application prerequisites verified 2026-11-13.

## Existing resources
- Render workspace: My Workspace
- Project: HandyConnect
- Environment: Staging
- PostgreSQL: `handyconnect-splee-db`, Frankfurt, PostgreSQL 18, free (expires 2026-12-13)
- No production HandyConnect or Standard Bank credentials may be copied into this environment.

## Upstream Splee architecture
Source: https://github.com/Iweisc/splee
- Rust/Axum backend: `backend/Cargo.toml`
- Next.js frontend: `frontend/package.json` (pnpm 10.29.2, Next 16)
- Upstream `docker-compose.yml` starts only a local Postgres database, **not the app**
- No root or backend Dockerfile was present at the time of inspection.

## Required staging service design
1. Review and pin a specific upstream Splee commit; avoid tracking an unreviewed moving branch.
2. Build an auditable multi-stage Docker image for Rust backend (including vendored Claude SDK and required system dependencies). Verify backend health, migrations and binding to `0.0.0.0:$PORT`.
3. Build frontend separately (or configure reverse proxy if upstream requires same origin). Verify backend API URLs, cookies, auth and CORS.
4. Place backend and database in Frankfurt; use Render's **internal** database URL, configured in Render secrets, not GitHub.
5. Set `SENDING_ENABLED=false`, `OPEN_SIGNUP=false`, `PUBLIC_AGENT=false`. Do not configure SMTP/IMAP, OAuth providers, outbound contact integrations, or prospect enrichment credentials.
6. Generate `APP_SECRET` in Render's secret settings; never commit it.
7. Verify migrations against a disposable database, then test UI sign-in, synthetic prospect import and no outbound message delivery.
8. Review upstream AGPL-3.0, security posture, POPIA and retention before using real contact records.
9. Disable automatic deployments until build and safety checks are verified.

## Important limits
- Free Render Postgres expires after 30 days; no real prospect records should be stored there.
- Current database public inbound rule `0.0.0.0/0` remains an outstanding hardening task; do not use production data until resolved.
- Never deploy the offline scoring prototype as though it were Splee itself.
- Do not expose the full application publicly before auth and access controls have been verified.

## Launch gate
A staging deployment is complete only when backend, frontend, database migrations, health checks, authentication, and outbound-disable behaviour have been independently tested.
