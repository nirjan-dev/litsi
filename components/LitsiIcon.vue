<script setup lang="ts">
defineProps<{ name: 'arrow' | 'video' | 'video-off' | 'mic' | 'mic-off' | 'link' | 'check' | 'users' | 'close' | 'screen' | 'chat' | 'leave' }>()
</script>

<template>
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-if="name === 'arrow'" d="M5 12h14m-6-6 6 6-6 6" />
    <template v-else-if="name === 'video' || name === 'video-off'">
      <rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3" />
      <path v-if="name === 'video-off'" d="m3 3 18 18" />
    </template>
    <template v-else-if="name === 'mic' || name === 'mic-off'">
      <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-3 0h6" />
      <path v-if="name === 'mic-off'" d="m3 3 18 18" />
    </template>
    <path v-else-if="name === 'link'" d="m10 14 4-4m-6 5-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)" />
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6" />
    <template v-else-if="name === 'users'"><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a6 6 0 0 1 2 5" /></template>
    <template v-else-if="name === 'screen'"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4m-4-11 4-4 4 4m-4-4v8" /></template>
    <path v-else-if="name === 'chat'" d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1V12.5A8.5 8.5 0 1 1 21 11.5ZM7 9h10M7 13h7" />
    <path v-else-if="name === 'leave'" d="M5 15c4-3 10-3 14 0l2-3c-5-5-13-5-18 0l2 3Zm2-2v4m10-4v4" />
    <path v-else d="m6 6 12 12M6 18 18 6" />
  </svg>
</template>
