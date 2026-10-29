# Configuration

Nuxt reads the following runtime environment variables. Keep secrets on the Node server; only `NUXT_PUBLIC_` settings are intended for browser exposure.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `NUXT_TURN_ID` | For call ICE configuration | Cloudflare TURN key ID. Server-only. |
| `NUXT_TURN_TOKEN` | For call ICE configuration | That TURN key's long-lived API token. Server-only. |
| `NUXT_PUBLIC_TELEMETRYDECK_APP_ID` | No | Empty disables analytics entirely. Setting an ID opts into app usage events without room/name payloads. |
| `NUXT_PUBLIC_DOCS_URL` | No | Documentation link shown in the app; defaults to `https://litsi.nirjan.dev/`. Use an absolute HTTP(S) URL. |
| `NITRO_HOST` | Deployment-dependent | Interface the production Node server binds to; Compose sets `0.0.0.0` inside the container. |
| `NITRO_PORT` | Deployment-dependent | Production HTTP port; Compose uses `3000`. |

## Local development versus production

For local development, copy the root `.env.example` to `.env` and use `pnpm dev`. Nuxt development reads that file. A built production Node process does **not** automatically read your checkout's `.env`: supply actual process environment variables (or use Docker's `--env-file` or Compose as documented).

Never commit secrets, paste them into screenshots, or pass them as build arguments. Root Docker build exclusions protect environment files, but keeping production secrets outside the build context is the safer operating convention.

## Compose-only settings

`deploy/.env.example` is a template, not a file you run unchanged. Copy it outside the repository to `$HOME/.config/litsi/deploy.env` and edit it.

- `LITSI_DOMAIN`: required public DNS hostname, without a scheme/path. Caddy uses it for TLS and routing. Do not use localhost or an example hostname for public certificate issuance.
- TURN variables: Compose requires nonempty values before it starts the production app.
- Public analytics/docs variables: passed as runtime environment to the app. No analytics value is provided by default.

`docker compose --env-file …` loads values for Compose substitution; the service explicitly forwards relevant values to the app. It does not give Caddy the TURN secrets. The app has no published host port and no persistent data mount. Changing an env file requires recreating the container with `up -d`.

## TURN limits are code-level boundaries

The capability TTL, credential TTL, per-session cache, 12 requests/minute, 30-second provider cooldown, and 60 provider attempts/hour are defined in `server/utils/turnSessions.ts`. They are not advertised environment knobs. See [architecture](./architecture#bounded-turn-issuance) for exact behavior. Do not increase these casually to mask repeated reconnects or an abuse spike.

## Documentation build settings

The docs package has its own `package.json` and `pnpm-lock.yaml`. `DOCS_BASE` is a **build-time** setting for VitePress, not a Nuxt runtime variable. It defaults to `/` for this project's custom domain, [litsi.nirjan.dev](https://litsi.nirjan.dev/). Set `DOCS_BASE=/litsi/` to build for the `nirjan-dev.github.io/litsi/` project site, then rebuild. The Pages workflow reads the optional GitHub Actions repository variable of the same name.

The docs use local search and system fonts. They have no analytics setup and require no app or Fly secrets. See [publication instructions](./self-hosting#publish-the-documentation).
