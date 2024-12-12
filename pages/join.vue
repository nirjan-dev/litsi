<template>
  <div class="flex px-4 flex-col gap-4 h-screen items-center justify-center">
    <h1 class="text-xl md:text-2xl">Joining room with ID: {{ roomID }}</h1>
    <form action="" class="flex flex-col gap-2">
      <label for="username"
        >Enter your display name
        <UInput
          class="w-full p-1"
          type="text"
          name="username"
          id="username"
          required
          v-model="username"
        />
      </label>
      <UButton block @click.prevent="enterRoom" type="submit"> Join </UButton>
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
