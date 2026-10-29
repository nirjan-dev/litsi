<script setup>
definePageMeta({ key: (route) => route.fullPath })
const route = useRoute()
const roomID = typeof route.params.roomID === 'string' ? route.params.roomID : ''
const username = typeof route.query.username === 'string' ? route.query.username.trim() : ''
if (!/^[A-Za-z0-9_-]{1,100}$/.test(roomID) || !username || username.length > 40) {
  await navigateTo({ path: '/join', query: { roomID } }, { replace: true })
}
const { media, status, error, participants, screenShares, screenStream, screenPending, messages, toggleScreenShare, sendMessage, stop } = useRoomCall(roomID, username)
const { cameraEnabled, microphoneEnabled, isRequesting, error: mediaError, toggleCamera, toggleMicrophone } = media
const docsUrl = useRuntimeConfig().public.docsUrl
const chatOpen = ref(false)
const chatTrigger = ref(null)
const chatInput = ref(null)
const messageList = ref(null)
const draft = ref('')
const unread = ref(0)
const copied = ref(false)
const copyError = ref('')
const inviteLink = ref('')
let copyTimer
const statusLabel = computed(() => ({ connecting: 'Connecting', connected: 'In the room', disconnected: 'Disconnected', rejected: 'Could not join', expired: 'Session expired' })[status.value])
const canChat = computed(() => status.value === 'connected' || status.value === 'expired')

onMounted(() => { inviteLink.value = `${location.origin}/join?roomID=${encodeURIComponent(roomID)}` })
onBeforeUnmount(() => clearTimeout(copyTimer))
useHead({ title: 'In the room — Litsi' })

async function copyInvite() {
  copyError.value = ''
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 2500)
  } catch {
    copyError.value = 'Copy this invitation link:'
  }
}
async function toggleChat() {
  chatOpen.value = !chatOpen.value
  if (chatOpen.value) {
    unread.value = 0
    await nextTick()
    chatInput.value?.focus()
    scrollMessages()
  } else {
    await nextTick()
    chatTrigger.value?.focus()
  }
}
function scrollMessages() {
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
}
watch(() => messages.value.length, async (count, previous) => {
  if (!chatOpen.value) {
    unread.value += messages.value.slice(previous).filter((message) => message.username !== username).length
    return
  }
  const list = messageList.value
  const atBottom = !list || list.scrollHeight - list.clientHeight - list.scrollTop < 100
  await nextTick()
  if (atBottom) scrollMessages()
})
function send() {
  if (!sendMessage(draft.value)) return
  draft.value = ''
  nextTick(scrollMessages)
}
function timeLabel(time) {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function initials(name) {
  return Array.from(name.trim()).slice(0, 2).join('').toLocaleUpperCase()
}
async function leave() {
  useAnalytics().trackEvent('ROOM.LEAVE')
  stop()
  await navigateTo('/')
}
async function rejoin() {
  stop()
  await navigateTo({ path: '/join', query: { roomID, username } })
}
</script>

<template>
  <div class="call-shell" :class="{ 'is-chat-open': chatOpen }">
    <header class="call-header">
      <div class="room-identity">
        <NuxtLink to="/" class="call-brand" aria-label="Leave the room and go to Litsi"><img src="/assets/images/logo.svg" width="30" height="30" alt="" /><span>Litsi</span></NuxtLink>
        <span class="header-divider" />
        <div class="room-details"><span class="room-name">Your conversation</span><span class="room-code" :title="roomID">Room {{ roomID.slice(0, 8) }}</span></div>
      </div>
      <div class="header-actions">
        <span class="room-status" :class="status" role="status"><span />{{ statusLabel }}</span>
        <button class="invite-button" @click="copyInvite"><LitsiIcon :name="copied ? 'check' : 'link'" /><span>{{ copied ? 'Link copied' : 'Copy invite link' }}</span></button>
      </div>
    </header>

    <div v-if="error || mediaError || copyError" class="call-notice" role="alert">
      <div><p>{{ error || mediaError || copyError }}</p><input v-if="copyError" class="invite-fallback" aria-label="Room invitation link" :value="inviteLink" readonly @focus="$event.target.select()" /></div>
      <button v-if="error" class="notice-action" @click="rejoin">{{ status === 'rejected' ? 'Change name' : 'Rejoin room' }}</button>
      <button v-else-if="mediaError" class="notice-action" :disabled="isRequesting" @click="media.requestMedia">Try devices again</button>
    </div>

    <div class="call-workspace">
      <main class="call-stage" :class="{ 'has-screen-share': screenShares.length }" aria-label="Call participants">
        <section v-if="screenShares.length" class="presentations" aria-label="Shared screens">
          <article v-for="share in screenShares" :key="share.stream.id" class="presentation">
            <StreamVideo :stream="share.stream" :muted="share.local" contain :label="`${share.name}’s shared screen`" />
            <div class="tile-label"><LitsiIcon name="screen" /><span>{{ share.local ? 'You are sharing' : `${share.name} is sharing` }}</span></div>
          </article>
        </section>
        <div class="participant-grid" :class="{ 'solo-grid': participants.length === 1 }">
          <article v-for="person in participants" :key="person.name" class="participant-tile" :class="{ 'camera-off': !person.video, 'local-tile': person.local }" :aria-label="`${person.name}${person.local ? ' (you)' : ''}`">
            <div class="participant-placeholder"><span class="participant-avatar">{{ initials(person.name) }}</span><span>{{ person.local ? 'Your camera is off' : person.video ? 'Connecting video…' : 'Camera off' }}</span></div>
            <StreamVideo v-if="person.stream" :stream="person.stream" :muted="person.local" :mirror="person.local" :hide-video="!person.video" :label="`${person.name}’s camera`" />
            <span v-if="!person.local && person.connection !== 'connected'" class="peer-status" role="status">{{ person.connection === 'connecting' ? 'Connecting…' : 'Connection lost' }}</span>
            <div class="tile-label"><span class="participant-name">{{ person.name }}<span v-if="person.local" class="you-label"> (you)</span></span><span class="media-indicator" :aria-label="person.audio ? 'Microphone on' : 'Microphone off'" :title="person.audio ? 'Microphone on' : 'Microphone off'"><LitsiIcon :name="person.audio ? 'mic' : 'mic-off'" /></span></div>
          </article>
        </div>
        <div v-if="participants.length === 1 && status === 'connected'" class="waiting-state"><span class="waiting-icon"><LitsiIcon name="users" /></span><h1>You’re the first one here.</h1><p>Bring someone into the conversation.</p><button class="waiting-invite" @click="copyInvite"><LitsiIcon :name="copied ? 'check' : 'link'" />{{ copied ? 'Invite link copied' : 'Copy invite link' }}</button></div>
      </main>

      <aside v-if="chatOpen" id="room-chat" class="chat-panel" aria-labelledby="chat-heading" @keydown.esc.stop.prevent="toggleChat">
        <div class="chat-header"><div><h2 id="chat-heading">Room chat</h2><p>Messages stay in this browser tab.</p></div><button class="close-chat" aria-label="Close chat" @click="toggleChat"><LitsiIcon name="close" /></button></div>
        <div ref="messageList" class="message-list" role="log" aria-label="Room messages" aria-live="polite" aria-relevant="additions">
          <div v-if="!messages.length" class="chat-empty"><LitsiIcon name="chat" /><h3>A little space to share.</h3><p>Send a link, a thought, or a quick hello to everyone in the room.</p></div>
          <article v-for="(message, index) in messages" :key="index" class="chat-message" :class="{ own: message.username === username }"><div class="message-meta"><strong>{{ message.username === username ? 'You' : message.username }}</strong><time :datetime="new Date(message.time).toISOString()">{{ timeLabel(message.time) }}</time></div><p>{{ message.text }}</p></article>
        </div>
        <form class="message-composer" @submit.prevent="send"><label for="chat-message" class="l-sr-only">Message everyone</label><textarea id="chat-message" ref="chatInput" v-model="draft" rows="2" maxlength="2000" placeholder="Message everyone…" :disabled="!canChat" @keydown.enter.exact.prevent="send" /><button type="submit" :disabled="!canChat || !draft.trim()" aria-label="Send message"><LitsiIcon name="arrow" /></button></form>
        <p class="chat-footnote">Visible to everyone. Cleared when you leave.</p>
      </aside>
    </div>

    <footer class="call-toolbar">
      <span class="participant-count"><LitsiIcon name="users" /><span>{{ participants.length }} {{ participants.length === 1 ? 'person' : 'people' }}</span></span>
      <div class="toolbar-controls">
        <button class="call-control" :class="{ 'device-off': !microphoneEnabled }" :aria-label="microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'" :aria-pressed="microphoneEnabled" :disabled="isRequesting" @click="toggleMicrophone"><LitsiIcon :name="microphoneEnabled ? 'mic' : 'mic-off'" /><span>Mic {{ microphoneEnabled ? 'on' : 'off' }}</span></button>
        <button class="call-control" :class="{ 'device-off': !cameraEnabled }" :aria-label="cameraEnabled ? 'Turn camera off' : 'Turn camera on'" :aria-pressed="cameraEnabled" :disabled="isRequesting" @click="toggleCamera"><LitsiIcon :name="cameraEnabled ? 'video' : 'video-off'" /><span>Camera {{ cameraEnabled ? 'on' : 'off' }}</span></button>
        <span class="control-divider" />
        <button class="call-control share-control" :class="{ active: screenStream }" :aria-label="screenStream ? 'Stop sharing screen' : 'Share screen'" :aria-pressed="!!screenStream" :disabled="screenPending || !canChat" @click="toggleScreenShare"><LitsiIcon name="screen" /><span>{{ screenStream ? 'Stop sharing' : 'Share screen' }}</span></button>
        <button ref="chatTrigger" class="call-control chat-control" :class="{ active: chatOpen }" :aria-label="`${chatOpen ? 'Close' : 'Open'} chat${unread ? `, ${unread} unread messages` : ''}`" :aria-expanded="chatOpen" aria-controls="room-chat" @click="toggleChat"><LitsiIcon name="chat" /><span>Chat</span><span v-if="unread" class="unread-badge">{{ unread }}</span></button>
        <button class="call-control leave-control" aria-label="Leave room" @click="leave"><LitsiIcon name="leave" /><span>Leave</span></button>
      </div>
      <a class="call-help" :href="docsUrl" target="_blank" rel="noopener noreferrer">About Litsi<LitsiIcon name="arrow" /></a>
    </footer>
  </div>
</template>

<style scoped>
.call-shell { height: 100dvh; min-height: 440px; display: flex; flex-direction: column; overflow: hidden; background: #101523; color: #e9edf5; color-scheme: dark; }
.call-header { flex-shrink: 0; min-height: 84px; display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 16px 30px; border-bottom: 1px solid #ffffff0d; }
.room-identity, .header-actions, .call-brand { display: flex; align-items: center; }
.room-identity { min-width: 0; gap: 24px; }
.call-brand { text-decoration: none; font-size: 1.5rem; font-weight: 750; gap: 8px; letter-spacing: -.05em; }
.header-divider { height: 28px; width: 1px; background: #ffffff18; }
.room-details { display: flex; flex-direction: column; gap: 5px; }
.room-name { font-size: .82rem; font-weight: 600; }
.room-code { font-size: .66rem; color: #919bb0; font-variant-numeric: tabular-nums; }
.header-actions { gap: 24px; }
.room-status { display: flex; gap: 8px; align-items: center; color: #aeb8ca; font-size: .72rem; white-space: nowrap; }
.room-status > span { width: 6px; height: 6px; background: #d8b571; border-radius: 50%; }
.room-status.connected > span { background: #8fcab2; }
.room-status.disconnected > span, .room-status.rejected > span { background: #e38a99; }
.invite-button { display: flex; gap: 9px; align-items: center; min-height: 44px; padding: 10px 15px; border: 1px solid #ffffff20; border-radius: 9px; background: #222b3e; color: #f1f2f8; font-weight: 550; font-size: .76rem; transition: background-color 140ms ease; }
.invite-button:hover { background: #303a51; }
.invite-button svg { width: 17px; height: 17px; }
.call-notice { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 30px; background: #332b39; color: #f3d8da; border-bottom: 1px solid #e998ad20; font-size: .8rem; line-height: 1.6; }
.call-notice p { margin: 0; }
.notice-action { flex-shrink: 0; min-height: 44px; padding: 8px 14px; border: 1px solid #e8bacd50; border-radius: 7px; background: transparent; color: #ffe9ef; font-weight: 650; font-size: .76rem; }
.invite-fallback { display: block; width: min(540px, 65vw); padding: 8px; margin-top: 6px; background: #101523; border: 1px solid #ffffff40; border-radius: 5px; color: white; }
.call-workspace { flex: 1; min-height: 0; display: flex; }
.call-stage { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 28px; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
.participant-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 16px; width: 100%; max-width: 1360px; margin: 0 auto; align-content: center; }
.participant-grid.solo-grid { max-width: 680px; }
.participant-tile, .presentation { position: relative; overflow: hidden; border: 1px solid #ffffff0d; border-radius: 16px; aspect-ratio: 16 / 10; background: #1b2336; }
.participant-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 17px; background: radial-gradient(ellipse at 50% 40%, #28324d, #1a2133 75%); color: #a2acc1; font-size: .75rem; }
.participant-avatar { width: 80px; height: 80px; border-radius: 50%; display: flex; justify-content: center; align-items: center; background: #6d66bb; color: #f8f6ff; font-size: 1.65rem; font-weight: 550; box-shadow: 0 0 0 6px #ffffff05; }
.participant-tile:nth-child(3n+2) .participant-avatar { background: #426c75; }
.participant-tile:nth-child(3n) .participant-avatar { background: #8a626d; }
.tile-label { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 24px 18px 15px; background: linear-gradient(transparent, #0b1020b8); font-size: .76rem; pointer-events: none; }
.participant-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.you-label { color: #b6bed0; }
.media-indicator { flex-shrink: 0; display: flex; width: 28px; height: 28px; justify-content: center; align-items: center; border-radius: 50%; background: #111827a6; }
.media-indicator svg { width: 15px; height: 15px; }
.peer-status { position: absolute; top: 14px; right: 14px; padding: 6px 9px; border-radius: 6px; background: #151c2de8; color: #d6c7a7; font-size: .65rem; }
.waiting-state { text-align: center; padding: 0 0 6px; }
.waiting-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; color: #a9a4ed; background: #7569d314; }
.waiting-icon svg { width: 18px; }
.waiting-state h1 { font-size: 1.1rem; font-weight: 600; letter-spacing: -.02em; margin: 12px 0 8px; }
.waiting-state p { color: #929eb5; font-size: .8rem; margin: 0 0 4px; }
.waiting-invite { display: inline-flex; align-items: center; gap: 8px; background: transparent; border: 0; min-height: 44px; color: #b6b0ff; font-size: .76rem; font-weight: 600; }
.waiting-invite svg { width: 16px; }
.presentations { flex: 1; min-height: 180px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr)); gap: 16px; }
.presentation { aspect-ratio: auto; min-height: 180px; background: #090d16; }
.presentation .tile-label { justify-content: flex-start; }
.presentation .tile-label svg { width: 16px; }
.has-screen-share { justify-content: stretch; gap: 16px; }
.has-screen-share .participant-grid { width: 100%; max-width: none; display: flex; overflow-x: auto; flex-shrink: 0; padding-bottom: 2px; }
.has-screen-share .participant-tile { width: 210px; flex-shrink: 0; }
.has-screen-share .participant-avatar { width: 44px; height: 44px; font-size: 1rem; }
.has-screen-share .participant-placeholder { gap: 10px; }
.has-screen-share .participant-placeholder > span:last-child { display: none; }
.has-screen-share .tile-label { padding: 16px 12px 10px; font-size: .68rem; }
.chat-panel { width: 340px; flex-shrink: 0; min-height: 0; display: flex; flex-direction: column; background: #171f30; border-left: 1px solid #ffffff0d; }
.chat-header { padding: 23px 20px 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid #ffffff0a; }
.chat-header h2 { font-size: .95rem; font-weight: 650; margin: 0 0 7px; }
.chat-header p { font-size: .67rem; line-height: 1.6; color: #9ba6bc; margin: 0; }
.close-chat { width: 44px; height: 44px; margin: -10px -10px 0 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: transparent; color: #a7b1c5; }
.close-chat:hover { background: #ffffff0b; }
.close-chat svg { width: 18px; }
.message-list { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
.chat-empty { max-width: 230px; text-align: center; margin: 28% auto 0; color: #8f9bb2; }
.chat-empty > svg { width: 26px; height: 26px; color: #736aab; }
.chat-empty h3 { color: #d5dbea; font-size: .86rem; font-weight: 550; margin: 18px 0 10px; }
.chat-empty p { font-size: .73rem; line-height: 1.8; margin: 0; }
.chat-message { margin-bottom: 21px; }
.message-meta { display: flex; gap: 10px; justify-content: space-between; align-items: baseline; margin-bottom: 7px; font-size: .68rem; }
.message-meta strong { color: #c3bbff; font-weight: 550; overflow-wrap: anywhere; }
.message-meta time { color: #8a97af; font-size: .61rem; flex-shrink: 0; }
.chat-message p { margin: 0; padding: 12px 14px; border-radius: 0 10px 10px; background: #242d42; color: #e0e6f2; font-size: .78rem; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-message.own p { background: #302e50; }
.message-composer { display: flex; gap: 10px; align-items: flex-end; margin: 0 16px; padding: 10px; border: 1px solid #ffffff18; border-radius: 10px; background: #101726; }
.message-composer textarea { resize: none; flex: 1; min-width: 0; max-height: 120px; border: 0; border-radius: 5px; background: transparent; padding: 7px 4px; color: #eef0fa; font-size: .78rem; line-height: 1.7; }
.message-composer textarea::placeholder { color: #8c98b0; }
.message-composer button { width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; border: 0; border-radius: 8px; background: #7569dc; color: white; }
.chat-footnote { text-align: center; padding: 0 16px 15px; margin: 10px 0 0; color: #929eb4; font-size: .6rem; }
.call-toolbar { flex-shrink: 0; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; min-height: 98px; padding: 16px 30px max(16px, env(safe-area-inset-bottom)); border-top: 1px solid #ffffff0d; background: #151c2b; }
.participant-count { display: flex; align-items: center; gap: 9px; color: #9ba7be; font-size: .73rem; white-space: nowrap; }
.participant-count svg { width: 18px; }
.toolbar-controls { display: flex; align-items: center; gap: 9px; }
.call-control { min-width: 68px; min-height: 60px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 1px solid #ffffff0f; border-radius: 11px; padding: 9px 13px; background: #242e42; color: #e3e9f5; transition: background-color 140ms ease, transform 100ms ease; }
.call-control:hover:not(:disabled) { background: #35405a; }
.call-control:active:not(:disabled) { transform: translateY(1px); }
.call-control > span:not(.unread-badge) { font-size: .6rem; line-height: 1.2; white-space: nowrap; }
.call-control.device-off { background: #342b3d; color: #edc6d1; border-color: #e998b21a; }
.call-control.device-off:hover:not(:disabled) { background: #48354b; }
.call-control.active { background: #39335d; border-color: #9387e06b; color: #dfdaff; }
.control-divider { width: 1px; height: 28px; background: #ffffff12; margin: 0 5px; }
.leave-control { margin-left: 7px; background: #b64156; border-color: transparent; color: #fff0f3; }
.leave-control:hover { background: #ce4c65 !important; }
.unread-badge { position: absolute; top: -6px; right: -5px; min-width: 19px; height: 19px; padding: 2px 5px; background: #ada1ff; color: #17132d; border-radius: 20px; font-size: .65rem; font-weight: 750; }
.call-help { justify-self: end; display: flex; min-height: 44px; align-items: center; gap: 7px; color: #9ba7be; text-decoration: none; font-size: .7rem; }
.call-help svg { width: 13px; }
@media (max-width: 1050px) { .call-toolbar { grid-template-columns: 1fr auto; gap: 10px; } .call-help { display: none; } .chat-panel { width: 300px; } .call-stage { padding: 22px; } .room-status { display: none; } }
@media (max-width: 760px) { .call-header { min-height: 76px; padding: 14px 18px; gap: 12px; } .room-identity { gap: 14px; } .call-brand span, .room-code, .header-divider { display: none; } .room-name { font-size: .75rem; } .header-actions { gap: 0; } .invite-button { min-height: 44px; font-size: .68rem; padding: 9px 11px; } .call-workspace { position: relative; } .call-stage { padding: 18px; gap: 22px; } .participant-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } .participant-grid.solo-grid { grid-template-columns: 1fr; max-width: 540px; } .participant-grid:not(.solo-grid) .participant-tile:last-child:nth-child(odd) { grid-column: 1 / -1; width: 72%; justify-self: center; } .participant-tile { border-radius: 12px; aspect-ratio: 4 / 3; } .solo-grid .participant-tile { aspect-ratio: 4 / 3; } .participant-avatar { width: 58px; height: 58px; font-size: 1.2rem; } .participant-placeholder { font-size: .64rem; gap: 12px; } .tile-label { padding: 20px 12px 10px; font-size: .68rem; } .media-indicator { width: 24px; height: 24px; } .peer-status { top: 9px; right: 9px; font-size: .56rem; padding: 5px 7px; } .call-toolbar { display: flex; justify-content: center; min-height: 92px; padding: 12px 10px max(12px, env(safe-area-inset-bottom)); } .participant-count { display: none; } .toolbar-controls { gap: 7px; width: 100%; max-width: 470px; justify-content: center; } .call-control { flex: 1; min-width: 0; max-width: 82px; padding: 9px 8px; min-height: 62px; gap: 7px; } .call-control > span:not(.unread-badge) { font-size: .56rem; } .call-control > svg { width: 19px; height: 19px; } .control-divider { display: none; } .leave-control { margin-left: 1px; } .chat-panel { position: absolute; inset: 0; width: 100%; border: 0; z-index: 5; } .is-chat-open .call-stage { visibility: hidden; } .message-list { padding: 20px 24px; } .chat-empty { margin-top: 20%; } .call-notice { padding: 12px 18px; flex-wrap: wrap; gap: 8px; font-size: .74rem; } .presentations { min-height: 200px; } .has-screen-share .participant-tile { width: 150px !important; aspect-ratio: 16 / 10; } .has-screen-share .participant-avatar { width: 36px; height: 36px; } .has-screen-share .participant-grid { gap: 10px; } }
@media (max-height: 700px) and (min-width: 761px) { .solo-grid { max-width: 480px !important; } .call-stage { padding: 16px 28px; gap: 16px; } .waiting-icon { display: none; } .waiting-state h1 { margin-top: 0; } }
</style>
