<template>
  <div class="flex items-center flex-col justify-center h-screen px-6">
    <h1 class="text-2xl md:text-4xl py-4">Welcome to NK chat</h1>
    <div class="flex flex-col gap-4 text-center">
      <button @click="joinRoom" class="mr-2 py-2 px-2 border-2">
        Create room
      </button>

      <hr />

      <form action="" class="flex flex-col gap-2">
        <label for="roomLink"
          >Enter room link
          <input
            class="w-full p-1 border-b-2 bg-gray-100"
            type="text"
            name="roomLink"
            id="roomLink"
            required
            v-model="roomLink"
          />
        </label>
        <button
          class="py-2 px-2 border-2"
          @click.prevent="joinRoom"
          type="submit"
        >
          Join
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const roomLink = ref("");
function joinRoom() {
  if (!roomLink.value) {
    const roomID = crypto.randomUUID();
    useRouter().push(`/join?roomID=${roomID}`);

    return;
  }

  const url = new URL(roomLink.value);
  const roomID = url.searchParams.get("roomID");

  if (!roomID) {
    alert("Invalid room link");
    return;
  }

  useRouter().push(`/join?roomID=${roomID}`);
}
</script>

<style scoped></style>
