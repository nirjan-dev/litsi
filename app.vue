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

const title = "Litsi — video calls, one simple link";
const description = "Create a room, share a link, and talk. No account required. A self-hostable WebRTC video chat with screen sharing and room chat.";
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
