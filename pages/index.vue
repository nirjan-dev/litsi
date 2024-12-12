<template>
  <div class="flex items-center flex-col justify-center h-screen px-6">
    <h1 class="text-2xl md:text-4xl py-4">Welcome to NK chat</h1>
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
