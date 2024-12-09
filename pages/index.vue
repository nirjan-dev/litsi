<template>
  <div class="h-screen flex flex-col justify-between">
    <button
      class="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4"
      @click="handleScreenShare"
    >
      share screen
    </button>
    <main class="grid grid-cols-12 min-h-svh">
      <section class="col-span-12 md:col-span-9">
        <div id="videos" class="grid grid-cols-2 h-full">
          <video controls id="localVideo" autoplay muted></video>
        </div>
      </section>
      <section class="col-span-12 md:col-span-3 bg-gray-100">
        <div class="flex max-h-64 overflow-y-scroll flex-col p-3">
          <p>live users: {{ store.usersList.length }}</p>
          <ul>
            <li
              class="flex items-center gap-1 mb-2"
              v-for="(user, index) in store.usersList"
            >
              <img
                :src="
                  'https://www.gravatar.com/avatar/' +
                  encodeURIComponent(store.usersHashList[index]) +
                  '?s=512&d=monsterid'
                "
                alt="Avatar"
                class="w-8 h-8 rounded-full"
              />
              {{ user }}
            </li>
          </ul>
        </div>

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
          class="bg-gray-800 px-4 py-2 flex items-center justify-between fixed bottom-0 w-full"
        >
          <div class="w-full min-w-6">
            <input
              type="text"
              placeholder="Type your message..."
              class="w-full rounded-l-lg px-4 py-2 bg-gray-700 text-white focus:outline-none focus:ring focus:border-blue-300"
              @keydown.enter="send"
              v-model="store.message"
            />
          </div>
          <div class="flex">
            <button
              class="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4"
              @click="send"
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import SimplePeer from "simple-peer/simplepeer.min.js";
let ws;

const store = reactive({
  message: "",
  messages: [],
  username: "anonymous",
  emailHash: "",
  usersList: [],
  usersHashList: [],
});

const peers = {};
let localStream;
let screenShareStream;

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

      for (const peer in peers) {
        peers[peer].addStream(screenShareStream);
      }

      const video = document.createElement("video");
      video.srcObject = screenShareStream;
      video.autoplay = true;
      video.playsInline = true;
      video.controls = true;
      document.getElementById("videos").appendChild(video);
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
    `?username=${store.username}`;
  if (ws) {
    ws.close();
  }

  ws = new WebSocket(url);

  ws.addEventListener("message", async (event) => {
    let data =
      typeof event.data === "string"
        ? event.data
        : await event.data.text().then((text) => JSON.parse(text));
    console.log(data);

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

  peers[username] = new SimplePeer({
    initiator: isInitiator,
    streams: [localStream],
    config: {
      iceServers: [iceServers],
    },
  });

  peers[username].on("signal", (data) => {
    console.log(data, "signal");
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
    console.log(stream, "stream");
    // video
    const newVid = document.createElement("video");
    newVid.srcObject = stream;

    newVid.playsinline = false;
    newVid.autoplay = true;
    newVid.className = "vid";
    newVid.controls = true;
    newVid.id = username;

    const videos = document.getElementById("videos");
    videos.appendChild(newVid);
  });

  peers[username].on("error", (data) => {
    console.log(data, "error");
    removePeer(username);
  });

  peers[username].on("close", () => {
    removePeer(username);
  });

  peers[username].on("connect", (data) => {
    console.log(data, "connect");
  });

  peers[username].on("data", (data) => {
    console.log(data, "data");
  });
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

  const videos = document.getElementById("videos");
  const vid = document.getElementById(username);
  if (vid) {
    videos.removeChild(vid);
  }
}

function initVideoCall(stream) {
  const localVideo = document.getElementById("localVideo");
  localVideo.srcObject = stream;
  localStream = stream;
}

onMounted(async () => {
  store.username = prompt("enter your name or email");

  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then(async (stream) => {
      await connect();
      initVideoCall(stream);
    })
    .catch((err) => {
      console.log(err);
    });
});
</script>
