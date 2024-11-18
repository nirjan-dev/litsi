<template>
  <div class="h-screen flex flex-col justify-between">
    <main>
      <div class="flex flex-col p-3 fixed top-0 right-0 border-2">
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
      <div id="messages" class="flex-grow flex flex-col justify-end px-4 py-8">
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
    </main>
  </div>
</template>

<script setup>
let ws;

const store = reactive({
  message: "",
  messages: [],
  username: "anonymous",
  emailHash: "",
  usersList: [],
  usersHashList: [],
});

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
    let data = typeof event.data === "string" ? data : await event.data.text();
    const {
      user = "system",
      message = "",
      action = "message",
      usersList = [],
    } = JSON.parse(data);

    if (action === "usersListUpdate") {
      store.usersList = usersList;
      return;
    }
    const hashedEmail = await hashEmail(user);
    log(
      user,
      hashedEmail,
      typeof message === "string" ? message : JSON.stringify(message)
    );
  });

  await new Promise((resolve) => ws.addEventListener("open", resolve));
};

const send = () => {
  console.log("sending message...");
  if (store.message) {
    ws.send(store.message);
  }
  store.message = "";
};

onMounted(async () => {
  store.username = prompt("What's your email?");
  await connect();
});
</script>
