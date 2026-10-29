# Architecture

Litsi keeps the web server, room admission, signalling, and chat in a single Nuxt/Nitro Node process. Vue renders the interface; simple-peer manages WebRTC peer connections between browsers. There is no SFU or media-processing service.

<div class="network-diagram">
<svg viewBox="0 0 900 420" role="img" aria-labelledby="network-title network-description" xmlns="http://www.w3.org/2000/svg">
  <title id="network-title">Signalling and media take different paths</title>
  <desc id="network-description">Browsers exchange media directly, or through Cloudflare TURN as a fallback. Both browsers connect to one Node server for signalling and chat. Node requests credentials from Cloudflare, but does not carry media.</desc>
  <defs><marker id="litsi-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="currentColor" /></marker></defs>
  <g fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="25" y="25" width="210" height="90" rx="12" />
    <rect x="665" y="25" width="210" height="90" rx="12" />
    <rect x="345" y="135" width="210" height="70" rx="12" />
    <rect x="335" y="300" width="230" height="90" rx="12" />
    <path d="M247 65H653" marker-start="url(#litsi-arrow)" marker-end="url(#litsi-arrow)" />
    <path d="M130 125V170H333M770 125V170H567" marker-start="url(#litsi-arrow)" marker-end="url(#litsi-arrow)" />
    <path d="M80 125V345H323M820 125V345H577" stroke-dasharray="6 5" marker-start="url(#litsi-arrow)" marker-end="url(#litsi-arrow)" />
    <path d="M450 288V217" stroke-dasharray="3 5" marker-start="url(#litsi-arrow)" marker-end="url(#litsi-arrow)" />
  </g>
  <g fill="currentColor" font-family="inherit" text-anchor="middle">
    <text x="130" y="63" font-size="17" font-weight="600">Browser A</text>
    <text x="130" y="88" font-size="14">Vue + simple-peer</text>
    <text x="770" y="63" font-size="17" font-weight="600">Browser B</text>
    <text x="770" y="88" font-size="14">Vue + simple-peer</text>
    <text x="450" y="45" font-size="14">WebRTC media · direct</text>
    <text x="450" y="163" font-size="17" font-weight="600">Cloudflare TURN</text>
    <text x="450" y="187" font-size="14">Media relay when needed</text>
    <text x="235" y="151" font-size="14">Relay fallback</text>
    <text x="665" y="151" font-size="14">Relay fallback</text>
    <text x="208" y="273" font-size="14">Signalling + chat</text>
    <text x="692" y="273" font-size="14">Signalling + chat</text>
    <text x="530" y="256" font-size="14">Credential API</text>
    <text x="450" y="336" font-size="17" font-weight="600">One Nuxt/Nitro process</text>
    <text x="450" y="361" font-size="14">Rooms + capabilities in memory</text>
  </g>
</svg>
</div>

Self-hosting the application does not remove its dependency on the external TURN provider.

## Joining a room

1. An invite opens `/join?roomID=…`; a room route is `/rooms/<roomID>?username=<name>`. Room IDs use 1–100 letters, digits, underscores, or hyphens. Names are trimmed and limited to 1–40 characters.
2. The browser previews devices only when requested and then connects to the same origin's `/_ws` WebSocket route.
3. The server validates room/name and rejects duplicate live names. Names remain the room's participant identity; admission is not account authentication.
4. Admission returns `sessionAdmitted` with an opaque capability and expiry. `usersListUpdate`, `newCallerJoined`, and `newCallerReceived` coordinate membership and peer creation. `signal` carries WebRTC negotiation between participants.
5. The browser requests ICE configuration from `POST /api/getIceUrls`, sending `Authorization: Bearer <capability>` and JSON `{ "roomID": "…" }`.
6. WebRTC selects a direct path or TURN relay path. Node never proxies the call's camera, microphone, or screen media.

## Chat and media state

Chat uses the WebSocket `message` event, not a private peer-to-peer data channel. The server receives and forwards chat text. The `mediaState` event reports audio/video enabled state and the screen stream ID for participant indicators. It does not contain media bytes. The server derives sender identity from the admitted connection, not a client-supplied sender name.

Leaving, socket closure, and peer teardown remove live state. Client-side peer handling ignores late signalling for departed peers rather than reconstructing a departed participant. A restart clears all in-memory room and capability state; there is no room recovery database.

## Bounded TURN issuance

- Each admitted connection receives a **one-hour capability**, bound to that room. Disconnecting revokes it; it is not an anonymous public TURN token endpoint.
- Cloudflare credentials request a **3,600-second TTL**. A session reuses its cached result across peers until 60 seconds before expiry; concurrent issuance requests share one provider request.
- Each session may make **12 endpoint requests per minute**, including cache hits.
- Each session may attempt provider issuance at most once every **30 seconds**. The process permits **60 provider attempts per hour**, including failures.
- Missing configuration produces 503, provider failure 502, exhausted limits 429, and absent/expired/mismatched admission 401.

These are issuance controls, not a complete abuse-prevention or identity system. A room link can admit new sessions and provider charges remain an operator responsibility. Rejoin for a new admission after the one-hour window; automatic long-call renewal is not supported.

## Why one process?

Rooms, sessions, caches, and issuance budgets are ordinary in-memory state. Multiple machines or clustered Node workers would disagree about admission and membership. Litsi does not provide a shared broker or datastore to reconcile them. A static export can serve documentation, but cannot replace this WebSocket/API server.
