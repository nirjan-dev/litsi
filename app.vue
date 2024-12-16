<template>
  <div>
    <NuxtRouteAnnouncer />
  </div>
  <NuxtPage />
</template>

<script setup lang="ts">
onMounted(() => {
  useAnalytics().trackEvent("APP.LOAD");
});

const title = `Litsi Chat - Instant, private video chats. No sign-up, no hassle.`;
const description = `Instant, private video chats. No sign-up, no hassle. Just pure, peer-to-peer connection, nothing is stored on the server. Create rooms, invite friends, and chat instantly.`;
const image = "/assets/images/og.png";

useSeoMeta({
  title,
  description,
  ogImage: image,
  twitterCard: "summary_large_image",
});

useHead({
  htmlAttrs: {
    lang: "en",
  },
});
</script>
