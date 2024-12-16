<template>
  <div class="flex items-center flex-col justify-center h-screen px-6">
    <h1 class="text-2xl flex items-center gap-2 md:text-4xl py-4">
      Welcome to Litsi

      <img src="/assets/images/logo.svg" class="w-10" alt="" />
    </h1>
    <p class="text-sm md:text-default mb-4 max-w-[45ch]">
      Instant, private video chats. No sign-up, no hassle. Just pure,
      peer-to-peer connection, nothing is stored on the server. Create rooms,
      invite friends, and chat instantly.
    </p>
    <p class="text-xs mb-6">
      Made with ❤️ by
      <a
        href="https://nirjan.dev"
        target="_blank"
        class="underline text-blue-500"
        >Nirjan</a
      >
    </p>
    <div class="flex flex-col gap-6 text-center">
      <UButton block @click="joinRoom"> Create new room </UButton>

      <hr />

      <form action="" class="flex flex-col gap-2">
        <label for="roomLink"
          >Enter room link
          <UInput
            class="my-1 w-full p-1"
            size="sm"
            type="text"
            name="roomLink"
            id="roomLink"
            required
            v-model="roomLink"
          />
        </label>
        <UButton
          block
          variant="outline"
          @click.prevent="joinRoom"
          type="submit"
        >
          Join
        </UButton>
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
