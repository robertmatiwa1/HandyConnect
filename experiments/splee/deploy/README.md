# Experimental Splee container builds

These files are a **proposed build configuration**, not a tested deployment.

Both Dockerfiles fetch the upstream `Iweisc/splee` source at a **mandatory reviewed commit SHA** passed as `SPLEE_REF`. Do not use `main` or a moving tag. This keeps upstream code out of the HandyConnect production app.

Backend build:
```sh
docker build -f experiments/splee/deploy/Dockerfile --build-arg SPLEE_REF=<reviewed-full-sha> -t splee-backend:staging .
```

Frontend build (the `API_URL` rewrite is compiled into Next.js output):
```sh
docker build -f experiments/splee/deploy/Dockerfile.frontend --build-arg SPLEE_REF=<same-sha> --build-arg API_URL=<private-backend-origin> -t splee-frontend:staging .
```

**Do not run these in production without validating** toolchain compatibility, vendor dependencies, runtime libraries, database migrations, API routing, and build-time `API_URL` behaviour. These images are not yet CI-built or security-scanned.

Render setup: two application services, backend and frontend, in Frankfurt. Configure backend `DATABASE_URL` from the Render internal Postgres connection string and generate a secret `APP_SECRET` in Render. Set `SENDING_ENABLED=false`, `PUBLIC_AGENT=false`, `OPEN_SIGNUP=false`, `BIND_ADDR=0.0.0.0:8787`, and appropriate `PUBLIC_URL`/`API_URL`. Backend requires database availability and runs SQL migrations on startup.

**Safety warning:** upstream documents that `SENDING_ENABLED=false` does not stop all worker activity, IMAP polling, or internal notifications. Do not configure email/social/agent integrations, and verify egress controls and authentication before making the frontend public. The backend should not have an unrestricted public endpoint.

The connected Render service creation API does not expose project/environment assignment, internal service creation, build arguments, or secure secret references. Therefore it is **not safe to create a public service through that API** and assume it will land in HandyConnect/Staging. Use the Render dashboard or a reviewed infrastructure-as-code mechanism for the final deployment.
