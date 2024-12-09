<template>
  <div class="flex px-4 flex-col gap-4 h-screen items-center justify-center">
    <h1 class="text-xl md:text-2xl">Joining room with ID: {{ roomID }}</h1>
    <form action="" class="flex flex-col gap-2">
      <label for="username"
        >Enter your display name
        <input
          class="w-full p-1 border-b-2 bg-gray-100"
          type="text"
          name="username"
          id="username"
          required
          v-model="username"
        />
      </label>
      <button
        @click.prevent="enterRoom"
        class="py-2 px-2 border-2"
        type="submit"
      >
        Join
      </button>
    </form>
  </div>
</template>

<script lang="ts" setup>
const { roomID } = useRoute().query;
const username = ref("");

function enterRoom() {
  useRouter().push(`/rooms/${roomID}?username=${username.value}`);
}
</script>

<style></style>
