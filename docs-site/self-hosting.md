# Self-hosting

Run **one Node process on one machine**, behind HTTPS. Rooms, membership, and TURN capabilities live in process memory. A static host, serverless function, Node cluster, or multiple replicas is not a supported application deployment. The documentation site is static; the application is not.

## Prerequisites

- A Linux host with Docker Engine and the Docker Compose v2 plugin (`docker compose`).
- A domain you control with public A/AAAA DNS records pointing at that host. Remove an AAAA record if the host cannot serve IPv6.
- Inbound TCP ports **80 and 443** available to Caddy, through your firewall/NAT. UDP 443 is optional for HTTP/3. No other service can already bind those ports.
- Outbound HTTPS to Cloudflare's credential API, and browsers able to reach peers or Cloudflare TURN. Opening TCP 443 on the app host is not a guarantee that every client's network permits WebRTC.
- A Cloudflare account with Realtime TURN enabled; relay usage may incur provider charges.

For the simplest initial setup, use DNS-only records if your DNS provider has a proxy mode. If you add another proxy later, it must preserve WebSocket upgrades at `/_ws`. Litsi does not require you to operate your own TURN server or expose TURN ports on the Node host.

## Cloudflare TURN credentials

Follow Cloudflare's first-party [Generate Credentials guide](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [Realtime TURN documentation](https://developers.cloudflare.com/realtime/turn/).

1. Create a TURN key in the Cloudflare dashboard's Realtime/Calls area (or use their documented API).
2. Copy the TURN key ID into `NUXT_TURN_ID` and that key's API token into `NUXT_TURN_TOKEN`.
3. Keep both on the server. These are long-lived issuance credentials, **not** the temporary username/password returned to browsers. Do not use a `NUXT_PUBLIC_` prefix for either.

Litsi calls the credential-generation API itself after admitting a room session. You do not need to manually generate an ICE credential or place temporary credentials in the browser bundle. Monitor provider usage and revoke/rotate the key in Cloudflare if it is exposed.

## Configure and start

Clone the repository on the host, then run these commands from its root:

```sh
git clone https://github.com/nirjan-dev/litsi.git
cd litsi
mkdir -p "$HOME/.config/litsi"
cp deploy/.env.example "$HOME/.config/litsi/deploy.env"
chmod 600 "$HOME/.config/litsi/deploy.env"
```

Edit `$HOME/.config/litsi/deploy.env` with a text editor. Set `LITSI_DOMAIN` to your hostname, such as `call.example.com` (no scheme or path), and fill in both TURN values. Leave analytics blank unless you explicitly want to enable it. The environment file deliberately lives **outside the repository and Docker build context** so it cannot be copied into the image.

```sh
docker compose --env-file "$HOME/.config/litsi/deploy.env" -f deploy/compose.yaml up -d --build
docker compose --env-file "$HOME/.config/litsi/deploy.env" -f deploy/compose.yaml logs --tail=100 caddy app
```

Caddy obtains and renews a public TLS certificate for your hostname and proxies HTTP and WebSocket traffic to the internal app service. The app is built using this repository's Dockerfile; only Caddy publishes host ports. Node port 3000 is not exposed publicly. Caddy's certificate/configuration state uses named volumes; the app needs no data volume.

Open `https://your-hostname`, create a room, and join from a second device on another network. Check media, chat, device toggles, leaving, and rejoining. Also test a duplicate display name: the second live session should be rejected without displacing the first.

## Upgrade, restart, and stop

Schedule a quiet window: recreating the app disconnects active calls and clears room membership and capabilities. Clients must rejoin; this setup does not transparently migrate calls.

```sh
git pull --ff-only
docker compose --env-file "$HOME/.config/litsi/deploy.env" -f deploy/compose.yaml up -d --build
# Restart the current deployment without rebuilding:
docker compose --env-file "$HOME/.config/litsi/deploy.env" -f deploy/compose.yaml restart
# Stop and remove containers while keeping Caddy certificate volumes:
docker compose --env-file "$HOME/.config/litsi/deploy.env" -f deploy/compose.yaml down
```

Runtime environment changes require `up -d` to recreate containers; `restart` alone does not apply new environment values. Avoid `down -v` unless you intentionally want to discard Caddy's certificate state. Save the current Git revision before upgrading if you need to check out that revision and rebuild as a rollback. There is no app-history database to migrate, but log retention and provider billing still need operational attention.

## Fly.io alternative

The repository also includes a Fly configuration and app deployment workflow. Provision your own Fly app, review `fly.toml` (including its app name), set `NUXT_TURN_ID` and `NUXT_TURN_TOKEN` with Fly secrets, and deploy using Fly's tooling. A local Compose env file is not read by Fly.

Explicitly run `fly scale count 1` for your app. Keep one machine and one Node process; the deploy workflow does not manage machine count. Do not enable horizontal scaling or autostop for a room server expected to retain live in-memory sessions. Fly deploys and machine restarts interrupt calls just like Compose recreations.

## Publish the documentation

The docs workflow is independent of Fly and the application runtime. It installs only `docs-site`, builds VitePress, and publishes the static output with GitHub Pages. It needs GitHub's Pages permissions, **not** `FLY_API_TOKEN`, TURN credentials, or analytics configuration.

1. In the GitHub repository's **Settings → Pages**, select **GitHub Actions** as the build/deployment source.
2. Add `litsi.nirjan.dev` as the custom domain and point its DNS `CNAME` at `nirjan-dev.github.io`. With Actions publishing no `CNAME` file is needed; the binding lives in the Pages settings.
3. Push docs changes to `master` or manually run the **Docs** workflow in Actions. This repository publishes to [https://litsi.nirjan.dev](https://litsi.nirjan.dev/).
4. Once GitHub has issued the domain's TLS certificate, enable **Enforce HTTPS** in the Pages settings.

The build defaults to a root base for that domain. The docs workflow reads an optional `DOCS_BASE` repository Actions variable: set `DOCS_BASE=/litsi/` to publish to the `https://nirjan-dev.github.io/litsi/` project site instead, then rebuild. Locally the same setting is `DOCS_BASE=/litsi/ pnpm build` from `docs-site`. If you host the docs under another hostname, set the app's `NUXT_PUBLIC_DOCS_URL` to match. Building the docs never deploys the application.
