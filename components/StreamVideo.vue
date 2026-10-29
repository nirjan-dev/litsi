<script setup>
const props = defineProps({
  stream: { type: Object, default: null },
  muted: Boolean,
  mirror: Boolean,
  hideVideo: Boolean,
  contain: Boolean,
  label: { type: String, default: 'Participant video' },
})
const video = ref(null)
const playbackBlocked = ref(false)

async function play() {
  if (!video.value || !props.stream) return
  try {
    await video.value.play()
    playbackBlocked.value = false
  } catch {
    playbackBlocked.value = !props.muted
  }
}
watch([video, () => props.stream, () => props.muted], ([element, stream]) => {
  if (!element) return
  if (element.srcObject !== stream) element.srcObject = stream
  element.muted = props.muted
  void play()
}, { flush: 'post' })
onBeforeUnmount(() => {
  if (video.value) video.value.srcObject = null
})
</script>

<template>
  <div class="stream-media">
    <video ref="video" autoplay playsinline :muted="muted" :aria-label="label" :class="{ mirrored: mirror, concealed: hideVideo, contained: contain }" @loadedmetadata="play" />
    <button v-if="playbackBlocked" class="play-audio" @click="play">Play audio</button>
  </div>
</template>

<style scoped>
.stream-media, video { position: absolute; inset: 0; width: 100%; height: 100%; }
video { object-fit: cover; }
video.mirrored { transform: scaleX(-1); }
video.concealed { opacity: 0; }
video.contained { object-fit: contain; }
.play-audio { position: absolute; top: 16px; left: 16px; z-index: 3; min-height: 44px; padding: 10px 16px; border: 1px solid #ffffff40; border-radius: 9px; background: #202b40; color: white; font-weight: 600; }
</style>
