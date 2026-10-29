---
layout: home
hero:
  name: Litsi
  text: A room link.<br>A conversation.
  tagline: Small, account-free video calls. Preview your devices, share a link, and meet — on your own infrastructure if you like.
  image:
    src: /logo.svg
    alt: Litsi camera mark
  actions:
    - theme: brand
      text: Try Litsi ↗
      link: https://litsi.fly.dev
    - theme: alt
      text: Self-host Litsi
      link: /self-hosting
    - theme: alt
      text: View on GitHub
      link: https://github.com/nirjan-dev/litsi
features:
  - title: Your call, not another account
    details: Choose a display name, check your camera and microphone, then share a room link. No sign-up or address book.
    link: /introduction
    linkText: See the flow
  - title: Browser-to-browser media
    details: WebRTC connects participants directly when possible, with Cloudflare TURN relay when needed. Node handles signalling and chat, not media.
    link: /architecture
    linkText: Understand the architecture
  - title: Small enough to operate
    details: One Node process, one machine, and HTTPS. A repository-built Docker Compose setup keeps the deployment understandable.
    link: /self-hosting
    linkText: Run your own
---

<div class="home-note">
<strong>Deliberately small.</strong> Litsi is an MIT-licensed portfolio project for small-group calls, not a managed conferencing service. There is no recording, account system, or persisted chat history. Room links grant access, not verified identity. Read the <a href="./privacy-and-limits.html">privacy and operating limits</a> before using it for a real conversation.
</div>
