<script setup lang="ts">
const router = useRouter()
const docsUrl = useRuntimeConfig().public.docsUrl
const roomLink = ref('')
const linkError = ref('')
const creating = ref(false)
const joining = ref(false)

async function createRoom() {
  if (creating.value) return
  creating.value = true
  linkError.value = ''
  try {
    await router.push({ path: '/join', query: { roomID: crypto.randomUUID() } })
  } catch {
    linkError.value = 'Could not open a new room. Please try again.'
  } finally {
    creating.value = false
  }
}

async function joinFromLink() {
  linkError.value = ''
  if (!roomLink.value.trim()) {
    linkError.value = 'Paste the room link your host shared with you.'
    return
  }
  let roomID: string | null = null
  try {
    const value = roomLink.value.trim()
    // Accept copied absolute links, root-relative paths, and host/path links.
    const input = /^[\w.-]+(?::\d+)?\/(?:join|rooms)(?:[/?#]|$)/i.test(value)
      ? `${window.location.protocol}//${value}` : value
    const url = new URL(input, window.location.origin)
    if (url.origin !== window.location.origin || url.username || url.password) throw new Error('origin')
    if (url.pathname === '/join' || url.pathname === '/join/') {
      if (url.searchParams.getAll('roomID').length !== 1) throw new Error('room')
      roomID = url.searchParams.get('roomID')
    } else {
      const match = url.pathname.match(/^\/rooms\/([^/]+)\/?$/)
      if (match) roomID = decodeURIComponent(match[1]!)
    }
    if (!roomID || !/^[A-Za-z0-9_-]{1,100}$/.test(roomID)) throw new Error('room')
  } catch {
    linkError.value = 'Use a Litsi room link from this site, such as /join?roomID=your-room. Check that you copied the whole link.'
    return
  }
  joining.value = true
  try {
    await router.push({ path: '/join', query: { roomID } })
  } catch {
    linkError.value = 'Could not open that room. Please try again.'
  } finally {
    joining.value = false
  }
}

useHead({ title: 'Litsi — A little closer, in a click', meta: [{ name: 'description', content: 'Simple video calls for small groups. Create a room, share a link, and get together. No account needed.' }] })
</script>

<template>
  <div class="landing">
    <header class="site-header">
      <NuxtLink to="/" class="brand-link"><BrandMark /></NuxtLink>
      <nav aria-label="Main navigation">
        <a :href="docsUrl">Docs</a>
        <a href="https://github.com/nirjan-dev/litsi" target="_blank" rel="noopener noreferrer">GitHub<span class="l-sr-only"> (opens in a new tab)</span></a>
      </nav>
    </header>

    <main class="landing-main">
      <section class="intro" aria-labelledby="landing-title">
        <p class="l-kicker">Good conversations start here</p>
        <h1 id="landing-title">A little closer.<br /><span>Just a link away.</span></h1>
        <p class="intro-copy">A simple place to get together. Start a video call, send your friends the link, and make a little room for conversation.</p>
        <button class="l-button create-button" :disabled="creating" @click="createRoom">
          <LitsiIcon name="video" />{{ creating ? 'Opening your room…' : 'Create a room' }}<LitsiIcon name="arrow" />
        </button>
        <p class="cta-note">No account. No download. Your browser is all you need.</p>
        <div class="feature-row" aria-label="Call features">
          <span><LitsiIcon name="users" />Made for small groups</span>
          <span><LitsiIcon name="check" />Camera always your choice</span>
        </div>
      </section>

      <aside class="join-panel" aria-labelledby="join-title">
        <div class="link-icon"><LitsiIcon name="link" /></div>
        <p class="l-kicker">Already invited?</p>
        <h2 id="join-title">Meet you there.</h2>
        <p>Have a room link? Drop it below.<br />You can check your camera before joining.</p>
        <form novalidate @submit.prevent="joinFromLink">
          <label for="room-link">Room link</label>
          <input id="room-link" v-model="roomLink" class="l-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste your invitation link" :aria-invalid="!!linkError" :aria-describedby="linkError ? 'link-error' : undefined" @input="linkError = ''" />
          <p v-if="linkError" id="link-error" class="inline-error" role="alert">{{ linkError }}</p>
          <button class="l-button l-button--secondary" type="submit" :disabled="joining">{{ joining ? 'Opening room…' : 'Join with a link' }}<LitsiIcon name="arrow" /></button>
        </form>
        <div class="panel-note"><span class="note-dot" />Your camera and mic stay off until you turn them on.</div>
      </aside>
    </main>

    <footer class="site-footer">
      <span>A small, open-source space for face-to-face time.</span>
      <a href="https://nirjan.dev" target="_blank" rel="noopener noreferrer">Made by Nirjan<span class="l-sr-only"> (opens in a new tab)</span></a>
    </footer>
  </div>
</template>

<style scoped>
.landing { min-height: 100svh; display: flex; flex-direction: column; max-width: 1240px; padding: 0 52px; margin: auto; }
.site-header { min-height: 112px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.brand-link { text-decoration: none; }
nav { display: flex; align-items: center; gap: 28px; }
nav a { display: inline-flex; align-items: center; min-height: 44px; text-decoration: none; font-size: .9rem; font-weight: 550; color: #596276; }
nav a:hover, .site-footer a:hover { color: #635bdf; }
.landing-main { flex: 1; display: grid; grid-template-columns: 1.35fr 1fr; align-items: center; gap: clamp(36px, 6vw, 92px); padding: 68px 0 100px; }
.intro .l-kicker { margin: 0 0 24px; }
h1 { font-size: clamp(2.8rem, 4.4vw, 4.1rem); letter-spacing: -.055em; font-weight: 750; line-height: 1.12; margin: 0; }
h1 span { color: #635bdf; }
.intro-copy { max-width: 430px; margin: 26px 0 30px; color: #5e6779; font-size: 1.08rem; line-height: 1.8; }
.create-button { min-height: 54px; padding: 14px 22px; }
.create-button svg:last-child { margin-left: 20px; }
.cta-note { color: #697386; font-size: .76rem; margin: 14px 0 0; line-height: 1.6; }
.feature-row { display: flex; flex-wrap: wrap; gap: 15px 24px; margin-top: 48px; font-size: .78rem; color: #596276; }
.feature-row span { display: inline-flex; gap: 7px; align-items: center; }
.feature-row svg { width: 17px; color: #635bdf; }
.join-panel { padding: 34px; background: #fff; border: 1px solid #e3e6ee; border-radius: 20px; box-shadow: 0 16px 55px -25px #17203322; }
.link-icon { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 13px; background: #eeedfd; color: #635bdf; margin-bottom: 28px; }
.join-panel .l-kicker { margin: 0 0 8px; }
h2 { margin: 0; font-size: 1.9rem; letter-spacing: -.04em; font-weight: 700; line-height: 1.3; }
.join-panel > p:not(.l-kicker) { color: #697386; font-size: .88rem; line-height: 1.8; margin: 14px 0 26px; }
form { display: grid; gap: 10px; }
label { font-size: .8rem; font-weight: 650; }
form .l-button { margin-top: 3px; justify-content: space-between; }
.inline-error { margin: 0; color: #a72b3f; font-size: .8rem; line-height: 1.6; }
.panel-note { border-top: 1px solid #edf0f5; margin-top: 26px; padding-top: 20px; font-size: .72rem; line-height: 1.7; color: #697386; display: flex; gap: 8px; align-items: baseline; }
.note-dot { flex: 0 0 6px; height: 6px; border-radius: 50%; background: #928be9; }
.site-footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #e2e6ed; padding: 24px 0; color: #768092; font-size: .75rem; line-height: 1.7; }
.site-footer a { display: inline-flex; align-items: center; min-height: 44px; margin-top: -12px; margin-bottom: -12px; text-decoration: none; white-space: nowrap; }
@media (max-width: 850px) { .landing { padding: 0 28px; } .landing-main { gap: 32px; } .join-panel { padding: 26px; } h1 { font-size: 3rem; } }
@media (max-width: 680px) { .landing { padding: 0 22px; } .site-header { min-height: 88px; } nav { gap: 20px; } .landing-main { grid-template-columns: 1fr; padding: 42px 0 48px; gap: 44px; } h1 { font-size: clamp(2.7rem, 9vw, 3.8rem); } .intro-copy { max-width: 460px; } .feature-row { margin-top: 28px; } .join-panel { padding: 28px 24px; } .site-footer { flex-direction: column; gap: 8px; } .site-footer a { margin: 0; align-self: flex-start; } }
</style>
