<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const docsUrl = useRuntimeConfig().public.docsUrl
const { stream, cameraEnabled, microphoneEnabled, isRequesting, error, requestMedia, toggleCamera, toggleMicrophone, stopMedia } = useCallMedia()
const username = ref(typeof route.query.username === 'string' ? route.query.username.slice(0, 40) : '')
const nameError = ref('')
const joining = ref(false)
const preview = ref<HTMLVideoElement | null>(null)
const roomID = computed(() => typeof route.query.roomID === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(route.query.roomID) ? route.query.roomID : '')
let intendedRoom = ''
let handoff = false

watch([preview, stream], ([video, media]) => {
  if (video && video.srcObject !== media) video.srcObject = media
}, { flush: 'post' })

onBeforeRouteLeave((to) => {
  handoff = !!intendedRoom && to.path === intendedRoom && to.query.username === username.value.trim()
})
onBeforeRouteUpdate((to) => {
  if (to.query.roomID !== route.query.roomID) {
    stopMedia()
    nameError.value = ''
  }
})
onBeforeUnmount(() => {
  if (!handoff) stopMedia()
})

async function enterRoom() {
  nameError.value = ''
  if (!roomID.value) return
  const name = username.value.trim()
  if (!name || name.length > 40) {
    nameError.value = 'Choose a display name between 1 and 40 characters.'
    return
  }
  if (joining.value) return
  joining.value = true
  intendedRoom = `/rooms/${encodeURIComponent(roomID.value)}`
  try {
    const failure = await router.push({ path: intendedRoom, query: { username: name } })
    if (failure) {
      handoff = false
      nameError.value = 'The room could not be opened. Please try again.'
    }
  } catch {
    handoff = false
    nameError.value = 'The room could not be opened. Please try again.'
  } finally {
    joining.value = false
    intendedRoom = ''
  }
}

useHead({ title: 'Get ready — Litsi' })
</script>

<template>
  <div class="prejoin">
    <header class="prejoin-header">
      <NuxtLink to="/" class="brand-link"><BrandMark /></NuxtLink>
      <a :href="docsUrl">Need a hand?</a>
    </header>

    <main v-if="!roomID" class="invalid-room">
      <div class="invalid-icon"><LitsiIcon name="link" /></div>
      <p class="l-kicker">Let’s try another link</p>
      <h1>This room link isn’t valid.</h1>
      <p>The invitation is missing a valid room ID. Ask your host for a fresh link, or create a room of your own.</p>
      <NuxtLink to="/" class="l-button">Back to Litsi<LitsiIcon name="arrow" /></NuxtLink>
    </main>

    <main v-else class="prejoin-main">
      <section class="preview-section" aria-label="Camera and microphone preview">
        <div class="camera-preview">
          <video ref="preview" v-show="cameraEnabled" autoplay muted playsinline aria-label="Your local camera preview" />
          <div v-if="!cameraEnabled" class="camera-placeholder">
            <div class="avatar">{{ username.trim().slice(0, 1).toLocaleUpperCase() || 'Y' }}</div>
            <span>Your camera is off</span>
            <p>A little privacy until you’re ready.</p>
          </div>
          <span class="preview-badge"><span />Only you can see this</span>
          <div class="preview-label"><span>{{ username.trim() || 'You' }}</span><LitsiIcon :name="microphoneEnabled ? 'mic' : 'mic-off'" /></div>
        </div>
        <div class="device-controls">
          <button class="device-toggle" :class="{ 'is-on': cameraEnabled }" :aria-pressed="cameraEnabled" :aria-label="cameraEnabled ? 'Turn camera off' : 'Turn camera on'" :disabled="isRequesting" @click="toggleCamera">
            <LitsiIcon :name="cameraEnabled ? 'video' : 'video-off'" /><span>Camera {{ cameraEnabled ? 'on' : 'off' }}</span>
          </button>
          <button class="device-toggle" :class="{ 'is-on': microphoneEnabled }" :aria-pressed="microphoneEnabled" :aria-label="microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'" :disabled="isRequesting" @click="toggleMicrophone">
            <LitsiIcon :name="microphoneEnabled ? 'mic' : 'mic-off'" /><span>Mic {{ microphoneEnabled ? 'on' : 'off' }}</span>
          </button>
        </div>
        <div class="permission-help">
          <p v-if="isRequesting" role="status">Waiting for your browser… Check the device permission prompt.</p>
          <template v-else>
            <p v-if="error" class="media-error" role="alert">{{ error }}</p>
            <p v-else>Devices start off. Turn them on when you’re ready.</p>
            <button v-if="!cameraEnabled || !microphoneEnabled" class="permission-link" @click="requestMedia">{{ error ? 'Try camera & microphone again' : 'Enable camera & microphone' }}</button>
          </template>
        </div>
      </section>

      <section class="join-details" aria-labelledby="prejoin-title">
        <p class="l-kicker">Make yourself comfortable</p>
        <h1 id="prejoin-title">Ready when <br />you are.</h1>
        <form novalidate @submit.prevent="enterRoom">
          <label for="display-name">Your display name</label>
          <input id="display-name" v-model="username" class="l-input" type="text" name="username" autocomplete="off" maxlength="40" placeholder="What should we call you?" :aria-invalid="!!nameError" :aria-describedby="nameError ? 'name-error' : 'name-help'" :disabled="joining" @input="nameError = ''" />
          <p id="name-help" class="name-help">Everyone in the room will see this name.</p>
          <p v-if="nameError" id="name-error" class="name-error" role="alert">{{ nameError }}</p>
          <button class="l-button join-button" type="submit" :disabled="joining">{{ joining ? 'Joining…' : 'Join room' }}<LitsiIcon name="arrow" /></button>
        </form>
        <p class="receive-note"><LitsiIcon name="check" />You can join with your camera and mic off.</p>
        <NuxtLink to="/" class="back-link">Not now? Go back</NuxtLink>
      </section>
    </main>
    <footer class="prejoin-footer">Your setup, your choice. Change your camera and mic any time during the call.</footer>
  </div>
</template>

<style scoped>
.prejoin { max-width: 1240px; min-height: 100svh; padding: 0 52px; margin: auto; display: flex; flex-direction: column; }
.prejoin-header { min-height: 112px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.brand-link { text-decoration: none; }
.prejoin-header > a:last-child { display: inline-flex; min-height: 44px; align-items: center; font-size: .85rem; color: #697386; text-decoration: none; }
.prejoin-main { flex: 1; display: grid; grid-template-columns: 1.4fr 1fr; gap: clamp(36px, 7vw, 90px); align-items: center; padding: 44px 0 54px; }
.preview-section { min-width: 0; }
.camera-preview { aspect-ratio: 4 / 3; position: relative; overflow: hidden; border-radius: 18px; background: #151c2e; color: #fff; box-shadow: 0 15px 40px -25px #17203366; }
video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); position: absolute; inset: 0; }
.camera-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; background: radial-gradient(ellipse at 50% 40%, #242c44, #141b2d 75%); }
.avatar { width: 86px; height: 86px; display: flex; align-items: center; justify-content: center; background: #7770d7; border: 5px solid #ffffff10; background-clip: padding-box; border-radius: 50%; font-size: 2rem; font-weight: 600; margin-bottom: 20px; }
.camera-placeholder > span { font-size: .9rem; font-weight: 550; color: #e3e7ef; }
.camera-placeholder p { font-size: .75rem; color: #9ca6bc; margin: 9px 0 0; }
.preview-badge { position: absolute; top: 18px; left: 18px; border: 1px solid #ffffff17; background: #111828b8; border-radius: 6px; padding: 7px 9px; display: flex; align-items: center; gap: 7px; font-size: .66rem; color: #d7dcea; }
.preview-badge > span { width: 5px; height: 5px; border-radius: 50%; background: #afa9f6; }
.preview-label { position: absolute; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 20px 18px; background: linear-gradient(transparent, #101523a6); font-size: .8rem; }
.preview-label > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.preview-label svg { flex-shrink: 0; width: 17px; }
.device-controls { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.device-toggle { display: inline-flex; justify-content: center; align-items: center; gap: 9px; min-height: 46px; padding: 11px 16px; border: 1px solid #dce0e9; border-radius: 24px; background: #fff; color: #566074; font-size: .8rem; font-weight: 550; transition: background-color 140ms ease, border-color 140ms ease; }
.device-toggle:hover:not(:disabled) { background: #eeeef7; }
.device-toggle.is-on { color: #5148c7; background: #eeedfd; border-color: #c9c5f5; }
.device-toggle svg { width: 18px; }
.permission-help { text-align: center; margin-top: 14px; font-size: .74rem; line-height: 1.7; color: #697386; }
.permission-help p { margin: 0; }
.permission-help .media-error { color: #a72b3f; }
.permission-link { min-height: 44px; padding: 8px 4px; background: transparent; border: 0; text-decoration: underline; text-underline-offset: 3px; color: #635bdf; font-size: .74rem; font-weight: 550; }
.join-details .l-kicker { margin: 0 0 14px; }
h1 { font-size: clamp(2.7rem, 4.1vw, 3.65rem); line-height: 1.12; letter-spacing: -.05em; margin: 0; font-weight: 750; }
.join-copy { color: #697386; font-size: .96rem; line-height: 1.75; margin: 22px 0 30px; max-width: 310px; }
form { display: flex; flex-direction: column; gap: 10px; }
label { font-size: .8rem; font-weight: 650; }
.name-help { font-size: .73rem; color: #768092; line-height: 1.5; margin: 0; }
.name-error { margin: 0; font-size: .8rem; line-height: 1.6; color: #a72b3f; }
.join-button { margin-top: 12px; min-height: 52px; justify-content: space-between; }
.receive-note { display: flex; align-items: center; gap: 7px; color: #697386; font-size: .72rem; line-height: 1.6; margin: 16px 0 6px; }
.receive-note svg { width: 15px; flex-shrink: 0; color: #635bdf; }
.back-link { display: inline-flex; min-height: 44px; align-items: center; font-size: .78rem; color: #697386; text-underline-offset: 3px; }
.prejoin-footer { padding: 22px 0; text-align: center; font-size: .73rem; line-height: 1.7; color: #768092; border-top: 1px solid #e2e6ed; }
.invalid-room { margin: auto; max-width: 500px; padding: 60px 0; text-align: center; }
.invalid-room h1 { font-size: 2.4rem; }
.invalid-room > p:not(.l-kicker) { color: #697386; line-height: 1.8; margin: 24px 0; }
.invalid-icon { display: flex; align-items: center; justify-content: center; width: 54px; height: 54px; margin: 0 auto 24px; border-radius: 15px; background: #eeedfd; color: #635bdf; }
@media (max-width: 850px) { .prejoin { padding: 0 28px; } .prejoin-main { gap: 36px; } }
@media (max-width: 680px) { .prejoin { padding: 0 22px; } .prejoin-header { min-height: 88px; } .prejoin-main { grid-template-columns: 1fr; padding: 24px 0 36px; gap: 28px; } .camera-preview { aspect-ratio: 4 / 3; max-height: 400px; } .join-details { padding-top: 4px; min-width: 0; } h1 { font-size: 2.6rem; } h1 br { display: none; } .join-copy { margin: 16px 0 24px; max-width: none; } .join-details .l-kicker { margin-bottom: 10px; } .prejoin-footer { text-align: left; } }
</style>
