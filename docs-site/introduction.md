# A smaller way to meet

Litsi is an open-source, account-free video chat app built with Nuxt 3, Vue, Nuxt UI 2, and simple-peer. It is a deliberately bounded portfolio project: small-group conversations, a readable codebase, and a deployment you can understand.

## Try the real app

[Open Litsi](https://litsi.fly.dev) in a current browser. The public instance is a demo, not an availability commitment. You can also [run it locally](./quickstart) or [host your own instance](./self-hosting).

1. Create a room or open an invite link.
2. Choose a display name. Names identify participants within a room; they are not verified identities. An already connected name cannot be reused in that room.
3. Preview your devices. Camera and microphone start off; granting permission is your choice.
4. Join, copy the invite link, and send it privately to another person.
5. Use the in-call camera, microphone, screen-sharing, and chat controls. Leaving ends your local media and room session.

A second browser profile with a different name is useful for a local walkthrough. Use headphones or mute one microphone to avoid feedback. Two devices on different networks are a more meaningful connectivity check.

## The interface

These screenshots were captured from the real local build with synthetic names and messages. Cameras are off in the screenshots; separate browser verification exercised actual WebRTC media using generated test devices, not real conversations.

![Litsi's landing page with create-room and join-link actions](/images/litsi-home.webp)

![The pre-call screen with a display name, camera preview and device controls](/images/litsi-prejoin.webp)

![A three-person room with cameras off, media controls and room chat](/images/litsi-call.webp)

## A short demonstration you can reproduce

The steps above are the demo: an actual entry → preview → call flow, rather than a simulated interface. To record your own 30–60 second walkthrough, show creating a room, checking devices, joining from a second profile, toggling a device, sending a chat message, and leaving. Obtain every participant's consent, use synthetic names and messages, and hide the room link before publishing a recording.

Litsi has **no built-in recording feature**. A walkthrough recorded with your operating system's screen recorder is separate from the application.

## What it does not promise

There are no accounts, meeting recordings, moderation roles, AI features, or SFU. Mesh calls consume more bandwidth as participants join. Calls beyond the one-hour admission window are not supported. Read [privacy and limits](./privacy-and-limits) before sharing anything sensitive.
