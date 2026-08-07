# Local administrator development

The repository's production authentication remains Cognito-backed. For local responsive UI work, the API has a separate development-only session fixture. It is enabled only when all of these are true:

- `NODE_ENV=development`
- `DEV_AUTH_BYPASS=true`
- the request host is `localhost` or `127.0.0.1`
- the local database contains the configured test student

The fixture creates an opaque Redis session with the `system_admin` role. It does not accept a password and it never runs in production.

## Start the local stack

```bash
cp .env.local.example .env.local
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d --build api
pnpm dev:admin
```

Open `http://localhost:5174`. In Vite development mode, the login screen shows `테스트 계정으로 시작`. The local API is on `http://localhost:4000` and the MySQL container is exposed on port `3307` only for local tooling.

The `api` dependency runs the local baseline, migrations, core seed, and test-user seed. To rerun only the test-user seed:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml run --rm bootstrap
```

Do not start the local stack with the repository's existing `.env` when it contains deployment credentials. Use `.env.local` so the container environment has no production provider credentials.
