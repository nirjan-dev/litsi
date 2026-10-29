# Local quickstart

## Prerequisites

- Node.js 22 and pnpm 9.11.0 (the repository's package-manager version).
- Git and a current browser with WebRTC support.
- Cloudflare TURN credentials for complete call connectivity; see [the setup guide](./self-hosting#cloudflare-turn-credentials).

From a terminal:

```sh
git clone https://github.com/nirjan-dev/litsi.git
cd litsi
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit `.env` to set `NUXT_TURN_ID` and `NUXT_TURN_TOKEN`. Leave `NUXT_PUBLIC_TELEMETRYDECK_APP_ID` empty: analytics is not required. Then:

```sh
pnpm dev
```

Open `http://localhost:3000`. Create a room and use another browser profile with a different name to join it. Localhost is a secure-context exception for camera/microphone access. Opening a plain HTTP LAN IP from another device is not equivalent; use HTTPS for remote devices.

You can explore the entry and prejoin UI without TURN credentials, but that does not prove that a call works. The app's ICE-credential endpoint requires configured TURN credentials and can return 503 when they are missing; do not treat direct networking as a guaranteed no-credentials mode.

## Local Docker smoke alternative

Build from this checkout; no application image registry is required:

```sh
docker build -t litsi-local .
docker run --rm --name litsi-local -p 127.0.0.1:3000:3000 \
  --env-file .env litsi-local
```

Open localhost, not a remote HTTP hostname. Keep the analytics ID blank in `.env`. Never put TURN credentials in Docker build arguments or commit your environment file. This is a local smoke setup, not the public HTTPS deployment; use [Compose with Caddy](./self-hosting) for that.

## Work on the documentation independently

The static docs are their own package; no app install, TURN credentials, or Fly token is needed:

```sh
cd docs-site
pnpm install --frozen-lockfile
pnpm dev
# Production output and local preview:
pnpm build
pnpm preview
```

The default base is `/`, matching the `litsi.nirjan.dev` custom domain; follow the URL printed by VitePress. Use `DOCS_BASE=/litsi/ pnpm dev` to mirror the GitHub project-site path. See [publishing the docs](./self-hosting#publish-the-documentation) for GitHub Pages and custom domains.
