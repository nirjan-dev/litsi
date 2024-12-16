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
</script>
