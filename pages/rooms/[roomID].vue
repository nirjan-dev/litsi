<template>
  <div class="h-screen flex flex-col justify-between pb-20">
    <main class="min-h-svh">
      <section
        class="video-section"
        :class="controls.isChatOpen ? 'md:w-3/4' : ''"
      >
        <div class="stream-container-parent">
          <div id="videos" class="stream-container">
            <div class="stream">
              <video id="localVideo" autoplay muted></video>
            </div>
          </div>
        </div>

        <div id="screenShare"></div>
      </section>
      <section
        v-show="controls.isChatOpen"
        class="fixed right-0 bottom-10 md:bottom-14 top-0 w-full md:w-1/4 z-50 bg-gray-800 flex flex-col justify-between"
      >
        <!-- Messages -->
        <div
          id="messages"
          class="flex-grow flex flex-col justify-end px-4 py-8"
        >
          <div class="flex items-center mb-4" v-for="message in store.messages">
            <div class="flex flex-col">
              <p class="text-gray-500 mb-1 text-xs ml-10">{{ message.user }}</p>
              <div class="flex items-center">
                <img
                  :src="
                    'https://www.gravatar.com/avatar/' +
                    encodeURIComponent(message.emailHash) +
                    '?s=512&d=monsterid'
                  "
                  alt="Avatar"
                  class="w-8 h-8 rounded-full"
                />
                <div class="ml-2 bg-gray-800 rounded-lg p-2">
                  <p class="text-white">{{ message.text }}</p>
                </div>
              </div>
              <p class="text-gray-500 mt-1 text-xs ml-10">{{ message.date }}</p>
            </div>
          </div>
        </div>

        <!-- Chatbox -->
        <div
          class="bg-gray-800 px-4 py-2 flex items-center justify-between w-full"
        >
          <div class="w-full min-w-6">
            <UInput
              size="md"
              class="mr-1"
              type="text"
              placeholder="Type your message..."
              @keydown.enter="send"
              v-model="store.message"
            />
          </div>
          <div class="flex">
            <UButton size="md" @click="send"> Send </UButton>
          </div>
        </div>
      </section>
    </main>

    <section class="fixed bg-gray-800 bottom-0 left-0 right-0 py-2">
      <div class="flex gap-4 items-center justify-center px-4">
        <div class="flex gap-4 text-xs">
          <div class="flex items-center flex-col gap-1">
            <UToggle
              on-icon="i-material-symbols:volume-off"
              off-icon="i-material-symbols:volume-up"
              v-model="controls.isAudioMuted"
            />
            <span class="hidden md:block">Audio</span>
          </div>
          <div class="flex items-center flex-col gap-1">
            <UToggle
              on-icon="i-material-symbols:videocam-off"
              off-icon="i-material-symbols:videocam"
              v-model="controls.isVideoDisabled"
            />
            <span class="hidden md:block">Video</span>
          </div>
          <div class="flex items-center flex-col gap-1">
            <UToggle
              on-icon="i-material-symbols:screen-share"
              off-icon="i-material-symbols:stop-screen-share"
              v-model="controls.isScreenShared"
            />
            <span class="hidden md:block">Screen Share</span>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <UButton
            @click="copyRoomLink"
            variant="ghost"
            color="gray"
            size="xs"
            class="flex items-center flex-col"
            icon="i-material-symbols:content-copy"
          >
            <span class="hidden md:block">{{
              hasCopiedLink ? "Copied!" : "Copy room link"
            }}</span>
          </UButton>
          <UButton
            @click="toggleChat"
            color="gray"
            variant="ghost"
            class="flex items-center flex-col"
            icon="i-material-symbols:chat"
            size="xs"
          >
            <span class="hidden md:block">{{
              controls.isChatOpen ? "Hide chat" : "Show chat"
            }}</span>
          </UButton>
          <UButton
            variant="ghost"
            @click="leaveRoom"
            color="red"
            class="flex items-center flex-col"
            icon="i-material-symbols:logout"
            size="xs"
          >
            <span class="hidden md:block">Leave room</span>
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import SimplePeer from "simple-peer/simplepeer.min.js";
let ws;

let streamTracker = null;
let streamsToTrack = [];

const controls = reactive({
  isVideoDisabled: false,
  isAudioMuted: false,
  isScreenShared: false,
  isChatOpen: false,
});

watch(
  () => controls.isVideoDisabled,
  () => {
    if (localStream) {
      localStream.getVideoTracks()[0].enabled = !controls.isVideoDisabled;
    }
  }
);
watch(
  () => controls.isAudioMuted,
  () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = !controls.isAudioMuted;
    }
  }
);

watch(
  () => controls.isScreenShared,
  () => {
    if (screenShareStream) {
      screenShareStream.getVideoTracks().forEach((track) => {
        track.stop();
      });
      removeVideo(screenShareStream.id);
      for (const peer in peers) {
        peers[peer].removeStream(screenShareStream);
      }
      screenShareStream = null;
    } else {
      handleScreenShare();
    }
  }
);

const store = reactive({
  message: "",
  messages: [],
  username: "anonymous",
  emailHash: "",
  usersList: [],
  usersHashList: [],
});

store.username = useRoute().query.username;
const roomID = useRoute().params.roomID;
const peers = {};
let localStream;
let screenShareStream;
const hasCopiedLink = ref(false);

function copyRoomLink() {
  const url = window.location.origin + "/join" + `?roomID=${roomID}`;
  navigator.clipboard.writeText(url).then(() => {
    hasCopiedLink.value = true;
    setTimeout(() => {
      hasCopiedLink.value = false;
    }, 2000);
  });
}

function toggleChat() {
  controls.isChatOpen = !controls.isChatOpen;
}

function handleScreenShare() {
  navigator.mediaDevices
    .getDisplayMedia({
      audio: true,
      monitorTypeSurfaces: "include",
      surfaceSwitching: "include",
      video: true,
    })
    .then((stream) => {
      screenShareStream = stream;
      screenShareStream.isScreenShare = true;
      for (const peer in peers) {
        peers[peer].addStream(screenShareStream);
      }

      addVideo(screenShareStream, screenShareStream.id, "screenShare");
    })
    .catch((err) => {
      console.log(err);
    });
}

async function updateHashList() {
  store.usersHashList = await Promise.all(
    store.usersList.map((user) => hashEmail(user))
  );
}

watch(
  () => store.usersList,
  async () => {
    await updateHashList();
  }
);

async function hashEmail(email) {
  const encoder = new TextEncoder();
  const data = encoder.encode(email);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

function leaveRoom() {
  localStream.getTracks().forEach((track) => {
    track.stop();
  });
  for (const peer in peers) {
    peers[peer].destroy();
  }
  ws.close();
  useAnalytics().trackEvent("ROOM.LEAVE", { roomID: roomID });
  useRouter().push("/");
}

const scroll = () => {
  nextTick(() => {
    const el = document.querySelector("#messages");
    if (!el) {
      return;
    }

    el.scrollTop = el.scrollHeight;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  });
};

const log = (user, hashedEmail, ...args) => {
  store.messages.push({
    text: args.join(" "),
    user: user,
    emailHash: hashedEmail,
    date: new Date().toLocaleString(),
  });
  scroll();
};

const connect = async () => {
  const isSecure = location.protocol === "https:";
  const url =
    (isSecure ? "wss://" : "ws://") +
    location.host +
    "/_ws" +
    `?username=${store.username}&roomID=${roomID}`;
  if (ws) {
    ws.close();
  }

  ws = new WebSocket(url);

  ws.addEventListener("message", async (event) => {
    let data =
      typeof event.data === "string"
        ? event.data
        : await event.data.text().then((text) => JSON.parse(text));
    // console.log(data);

    switch (data.type) {
      case "newCallerJoined":
        await addPeer(data.payload.username, false);
        ws.send(
          JSON.stringify({ type: "newCallerReceived", payload: data.payload })
        );
        return;

      case "newCallerReceived":
        await addPeer(data.payload.username, true);
        return;
      case "signal":
        peers[data.payload.username].signal(data.payload.signal);
        return;
      case "message":
        const hashedEmail = await hashEmail(data.payload.username);
        log(data.payload.username, hashedEmail, data.payload.message);
        return;
      case "usersListUpdate":
        store.usersList = data.payload.usersList;
        return;

      default:
        break;
    }
  });
};

async function addPeer(username, isInitiator) {
  if (!username) {
    return;
  }

  const { iceServers } = await $fetch(`/api/getIceUrls`);

  if (!iceServers) {
    return;
  }

  const streams = [localStream];

  if (screenShareStream) {
    streams.push(screenShareStream);
  }

  peers[username] = new SimplePeer({
    initiator: isInitiator,
    streams,
    config: {
      iceServers: [iceServers],
    },
  });

  peers[username].on("signal", (data) => {
    // console.log(data, "signal");
    ws.send(
      JSON.stringify({
        type: "signal",
        payload: {
          signal: data,
          username,
        },
      })
    );
  });
  peers[username].on("stream", (stream) => {
    // console.log(stream, "stream", peers, peers[username]);
    // INFO: assuming that screen share stream is always the second stream
    const isScreenShare = peers[username]._remoteStreams.length === 2;
    isScreenShare
      ? addVideo(stream, stream.id, "screenShare")
      : addVideo(stream, stream.id);
  });

  peers[username].on("error", (data) => {
    console.log(data, "error");
    useAnalytics().trackEvent("PEER.ERROR", { roomID });
    removePeer(username);
  });

  peers[username].on("close", () => {
    removePeer(username);
  });

  peers[username].on("connect", (data) => {
    // console.log(data, "connect");
  });

  peers[username].on("data", (data) => {
    // console.log(data, "data");
  });
}

function addVideo(stream, streamID, parentID) {
  const newVid = document.createElement("video");
  const videoContainer = document.createElement("div");
  videoContainer.classList.add("stream");
  videoContainer.id = streamID;
  newVid.srcObject = stream;
  newVid.playsinline = false;
  newVid.autoplay = true;
  newVid.className = "vid";
  newVid.controls = true;
  videoContainer.appendChild(newVid);
  const videos = document.getElementById(parentID || "videos");
  videos.appendChild(videoContainer);

  streamsToTrack.push(stream);
}

function removeVideo(streamID) {
  const vid = document.getElementById(streamID);
  if (vid) {
    vid.parentNode.removeChild(vid);
  }

  streamsToTrack = streamsToTrack.filter((stream) => stream.id !== streamID);
}

const send = () => {
  console.log("sending message...");
  if (store.message) {
    ws.send(
      JSON.stringify({
        type: "message",
        payload: {
          message: store.message,
          username: store.username,
        },
      })
    );
  }
  store.message = "";
};

function removePeer(username) {
  peers[username]?.destroy();
  delete peers[username];

  removeVideo(username);
}

function initVideoCall(stream) {
  const localVideo = document.getElementById("localVideo");
  localVideo.srcObject = stream;
  localStream = stream;
}

onMounted(async () => {
  useAnalytics().setUserID(store.username);
  useAnalytics().trackEvent("ROOM.JOIN", { roomID });

  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then(async (stream) => {
      await connect();
      initVideoCall(stream);
    })
    .catch((err) => {
      console.log(err);
    });

  streamTracker = setInterval(() => {
    streamsToTrack.forEach((stream) => {
      if (!stream.active && document.getElementById(stream.id)) {
        removeVideo(stream.id);
      }
    });
  }, 3000);
});

onBeforeUnmount(() => {
  if (streamTracker) {
    clearInterval(streamTracker);
    streamTracker = null;
  }
});
</script>

<style>
.video-section {
  @apply flex h-full pb-10 flex-col md:flex-row;
}

.stream-container-parent {
  @apply flex-1 h-full;
  container-type: inline-size;
}

.stream-container {
  @apply flex flex-wrap h-full;

  @container (min-width: 640px) {
    @apply flex-nowrap;
  }
}

.stream-container .stream:nth-child(3):last-child {
  @apply col-span-2;
}
.stream {
  @apply bg-slate-900 relative overflow-hidden  w-full;

  video {
    @apply w-full absolute inset-0 h-full object-cover;
  }
}

#screenShare {
  @apply md:w-3/4 h-2/4 md:h-full w-full;

  &:empty {
    @apply w-0 h-0;
  }

  .stream {
    @apply w-full h-full;
  }

  video {
    @apply w-full h-full object-contain;
  }
}
</style>
