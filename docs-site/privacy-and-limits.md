# Privacy and limits

## Who can see what?

| Component | Data it handles |
| --- | --- |
| Other participants | Your chosen display name, received chat, enabled-state indicators, and media you share. Direct WebRTC connectivity may reveal network addresses to peers. |
| Litsi Node server | Room/name admission, WebSocket signalling (including connectivity metadata), media-state indicators, chat text in transit, and capability/credential issuance state. |
| TURN provider | Relayed encrypted WebRTC traffic when selected, plus network/usage metadata and credential issuance. Media is not routed through the Litsi Node process. |
| Host, proxy, and infrastructure providers | Request/network metadata and whatever their logs, configuration, and retention policies capture. URLs can contain room IDs and display names. |
| TelemetryDeck, only when configured | App usage events. The app does not include chosen names or room IDs in event payloads. Provider/network metadata is still subject to that provider's policy. |

WebRTC encrypts media in transit. That does not make Litsi an audited high-security communication system or stop a participant from recording their own screen. Share sensitive material only after considering your participants, host, device, and network.

## No application history database

Litsi does not persist accounts, chat history, room history, or recordings. Chat travels through the server and is held in the current browser session; a new participant does not receive a saved transcript. Restarting the app discards its live room state.

“No app history” is **not** a promise of zero data anywhere. Browser history, copied invite links, proxy/host logs, Cloudflare records, and optionally analytics are separate surfaces. Review operator logs and provider retention rather than assuming they are absent. Avoid putting identifying information in room IDs or display names.

## Access is possession of a link

There is no identity verification, room password, waiting room, moderator, or account authorization. Someone who obtains a valid room link can try to join. Display names must be unique among currently connected participants, but anyone can choose an available name; this is not protection against impersonation. Send links privately and leave if an unexpected person appears.

## Devices and external requests

Camera and microphone start disabled. Preview permission is explicit; the browser controls which devices are allowed. Screen sharing requires the browser's own picker. Leaving stops locally acquired media tracks. There is no Gravatar lookup or account-avatar service.

Analytics is **off when `NUXT_PUBLIC_TELEMETRYDECK_APP_ID` is empty**: the app does not initialize its analytics client in that case. Setting an ID is the operator's opt-in to app usage events, not a requirement to run Litsi or the docs. A hosted operator should provide any disclosures/consent required for their jurisdiction and deployment. See [TelemetryDeck's privacy policy](https://telemetrydeck.com/privacy/).

## Deliberate operating limits

- **Small groups, not webinars.** Mesh creates a peer connection for each pair of participants: `n × (n − 1) / 2` connections. Per-device upload and CPU needs grow with room size. There is no benchmarked participant-capacity guarantee.
- **One-hour admissions.** Calls longer than one hour are outside the supported session window; leave and rejoin rather than relying on automatic renewal.
- **One process and one machine.** No multi-replica/serverless deployment, automatic session recovery, or durable meeting state.
- **Browser/network dependent.** Device permissions, available codecs, screen-sharing support, NAT/firewall rules, and TURN availability affect results. Mobile/browser feature support varies.
- **No recording, AI, SFU, or moderation system.** These are scope boundaries, not advertised upcoming features.
- **A portfolio demo, not a service-level agreement.** Monitor your own host and relay budget when self-hosting.
