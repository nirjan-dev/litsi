import SimplePeer from 'simple-peer/simplepeer.min.js'
import { createPeerRegistry } from '../utils/peerRegistry.mjs'

export function useRoomCall(roomID, username) {
  const media = useCallMedia()
  const { trackEvent } = useAnalytics()
  const status = ref('connecting')
  const error = ref('')
  const members = ref([username])
  const mediaStates = reactive(new Map())
  const peerStates = reactive(new Map())
  const remoteStreams = shallowReactive(new Map())
  const messages = ref([])
  const screenStream = shallowRef(null)
  const screenPending = ref(false)
  let socket = null
  let session = null
  let credentials = null
  let credentialRequest = null
  let disposed = false
  let expiryTimer
  let connectTimer
  const sentTracks = new WeakMap()
  const decoder = new TextDecoder()
  const registry = createPeerRegistry(createPeer)

  function send(type, payload) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, payload }))
  }

  function publishMediaState() {
    if (!session) return
    send('mediaState', {
      audio: media.microphoneEnabled.value,
      video: media.cameraEnabled.value,
      screenStreamID: screenStream.value?.id ?? null,
    })
  }

  function setupError(cause) {
    const code = cause?.statusCode || cause?.status || cause?.response?.status
    if (code === 429) return 'Call setup is temporarily limited. Wait a minute before rejoining; the relay has a shared hourly budget.'
    if (code === 401) return 'Your room session has expired. Rejoin the room to connect to new participants.'
    if (code === 503) return 'The relay is not configured on this instance. Ask its operator to check the TURN settings.'
    if (code === 502) return 'The relay provider could not be reached. Wait a moment, then rejoin the room.'
    return 'Could not connect the call. Check your network, then rejoin the room.'
  }

  async function getIceCredentials() {
    const admitted = session
    if (!admitted || admitted.expiresAt <= Date.now()) throw { statusCode: 401 }
    if (credentials && credentials.expiresAt > Date.now() + 60_000) return credentials
    if (!credentialRequest) {
      credentialRequest = $fetch('/api/getIceUrls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${admitted.capability}` },
        body: { roomID },
        retry: 0,
      }).then((result) => {
        if (disposed || session !== admitted) throw { statusCode: 401 }
        credentials = result
        return result
      }).finally(() => {
        if (session === admitted) credentialRequest = null
      })
    }
    return credentialRequest
  }

  async function createPeer(name, initiator) {
    const { iceServers } = await getIceCredentials()
    if (disposed || !members.value.includes(name)) throw new Error('Participant left during setup')
    const streams = [media.stream.value, screenStream.value].filter(Boolean)
    const peer = new SimplePeer({ initiator, streams, config: { iceServers } })
    sentTracks.set(peer, new Map(media.stream.value?.getTracks().map((track) => [track, media.stream.value]) ?? []))
    peer.on('signal', (signal) => {
      if (registry.get(name) === peer) send('signal', { username: name, signal })
    })
    peer.on('stream', (stream) => {
      if (registry.get(name) !== peer) return
      const streams = remoteStreams.get(name) ?? []
      if (!streams.some((existing) => existing.id === stream.id)) remoteStreams.set(name, [...streams, stream])
    })
    peer.on('connect', () => {
      if (registry.get(name) === peer) peerStates.set(name, 'connected')
    })
    peer.on('error', () => {
      if (registry.get(name) !== peer) return
      peerStates.set(name, 'failed')
      error.value = `Could not connect to ${name}. Rejoin the room to try again.`
      registry.remove(name, peer)
      remoteStreams.delete(name)
      trackEvent('PEER.ERROR')
    })
    peer.on('close', () => {
      if (registry.get(name) !== peer) return
      registry.remove(name, peer)
      remoteStreams.delete(name)
      if (members.value.includes(name)) peerStates.set(name, 'disconnected')
    })
    return peer
  }

  async function addPeer(name, initiator, acknowledge = false) {
    if (!name || name === username || !members.value.includes(name)) return
    const currentSocket = socket
    peerStates.set(name, 'connecting')
    try {
      const peer = await registry.ensure(name, initiator)
      if (peer && acknowledge && socket === currentSocket && !disposed) send('newCallerReceived', { username: name })
    } catch (cause) {
      if (!disposed && members.value.includes(name)) {
        peerStates.set(name, 'failed')
        error.value = setupError(cause)
      }
    }
  }

  function updateMediaState(state) {
    const previous = mediaStates.get(state.username)
    if (previous?.screenStreamID && previous.screenStreamID !== state.screenStreamID) {
      const streams = remoteStreams.get(state.username)
      if (streams) remoteStreams.set(state.username, streams.filter((stream) => stream.id !== previous.screenStreamID))
    }
    mediaStates.set(state.username, state)
  }

  function onMessage(event, currentSocket) {
    if (disposed || socket !== currentSocket) return
    try {
      const text = typeof event.data === 'string' ? event.data : decoder.decode(event.data)
      const { type, payload } = JSON.parse(text)
      switch (type) {
        case 'sessionAdmitted':
          session = payload
          status.value = 'connected'
          clearTimeout(connectTimer)
          expiryTimer = setTimeout(() => {
            status.value = 'expired'
            error.value = 'This room session has expired. Existing media may continue, but rejoin before connecting new participants.'
          }, Math.max(0, payload.expiresAt - Date.now()))
          publishMediaState()
          trackEvent('ROOM.JOIN')
          break
        case 'roomError':
          status.value = 'rejected'
          error.value = payload.message
          break
        case 'usersListUpdate': {
          members.value = payload.usersList
          registry.retain(payload.usersList)
          for (const name of peerStates.keys()) {
            if (!payload.usersList.includes(name)) {
              peerStates.delete(name)
              remoteStreams.delete(name)
              mediaStates.delete(name)
            }
          }
          for (const state of payload.mediaStates ?? []) updateMediaState(state)
          break
        }
        case 'mediaState':
          updateMediaState(payload)
          break
        case 'newCallerJoined':
          void addPeer(payload.username, false, true)
          break
        case 'newCallerReceived':
          void addPeer(payload.username, true)
          break
        case 'signal':
          if (members.value.includes(payload.username)) registry.signal(payload.username, payload.signal)
          break
        case 'message':
          messages.value.push({ username: payload.username, text: payload.message, time: Date.now() })
          break
      }
    } catch {
      error.value = 'A call update could not be processed. Rejoin if the conversation is not working.'
    }
  }

  function syncLocalTracks() {
    if (disposed) return
    const stream = media.stream.value
    registry.forEach((peer) => {
      const sent = sentTracks.get(peer)
      if (!sent) return
      for (const [track, originalStream] of sent) {
        if (track.readyState === 'ended') {
          peer.removeTrack(track, originalStream)
          sent.delete(track)
        }
      }
      for (const track of stream?.getTracks() ?? []) {
        if (track.readyState === 'live' && !sent.has(track)) {
          peer.addTrack(track, stream)
          sent.set(track, stream)
        }
      }
    })
    publishMediaState()
  }

  watch(media.mediaVersion, syncLocalTracks)
  watch([media.cameraEnabled, media.microphoneEnabled], publishMediaState)

  function stopScreenShare() {
    const stream = screenStream.value
    if (!stream) return
    screenStream.value = null
    registry.forEach((peer) => peer.removeStream(stream))
    for (const track of stream.getTracks()) {
      track.onended = null
      track.stop()
    }
    publishMediaState()
  }

  async function toggleScreenShare() {
    if (screenStream.value) return stopScreenShare()
    if (screenPending.value || disposed) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error.value = 'Screen sharing is not available in this browser. Try a desktop browser over HTTPS.'
      return
    }
    screenPending.value = true
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      screenStream.value = stream
      publishMediaState()
      registry.forEach((peer) => peer.addStream(stream))
      stream.getVideoTracks()[0].onended = () => {
        if (screenStream.value === stream) stopScreenShare()
      }
    } catch (cause) {
      if (!disposed) error.value = cause?.name === 'NotAllowedError'
        ? 'Screen sharing was not started. Choose a screen or window when your browser asks.'
        : 'Could not share your screen. Check your browser and operating system screen-recording permissions.'
    } finally {
      screenPending.value = false
    }
  }

  function sendMessage(text) {
    const message = text.trim()
    if (!message || !['connected', 'expired'].includes(status.value)) return false
    send('message', { message })
    return true
  }

  function stop() {
    if (disposed) return
    disposed = true
    clearTimeout(connectTimer)
    clearTimeout(expiryTimer)
    session = null
    credentials = null
    credentialRequest = null
    const currentSocket = socket
    socket = null
    currentSocket?.close()
    registry.clear()
    remoteStreams.clear()
    stopScreenShare()
    media.stopMedia()
    window.removeEventListener('pagehide', stop)
  }

  onMounted(() => {
    const url = new URL('/_ws', window.location.origin)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('roomID', roomID)
    url.searchParams.set('username', username)
    const currentSocket = new WebSocket(url)
    currentSocket.binaryType = 'arraybuffer'
    socket = currentSocket
    connectTimer = setTimeout(() => {
      if (status.value !== 'connecting') return
      error.value = 'The room server is not responding. Check your connection and rejoin.'
      currentSocket.close()
    }, 15_000)
    currentSocket.addEventListener('message', (event) => onMessage(event, currentSocket))
    currentSocket.addEventListener('close', () => {
      if (disposed || socket !== currentSocket) return
      clearTimeout(connectTimer)
      clearTimeout(expiryTimer)
      session = null
      credentials = null
      credentialRequest = null
      registry.clear()
      remoteStreams.clear()
      if (status.value !== 'rejected') {
        status.value = 'disconnected'
        error.value ||= 'You have been disconnected from the room. Rejoin to reconnect; the server may have restarted.'
      }
    })
    currentSocket.addEventListener('error', () => {
      if (!disposed && socket === currentSocket) error.value ||= 'Could not reach the room server. Check your connection and rejoin.'
    })
    window.addEventListener('pagehide', stop)
  })
  onBeforeUnmount(stop)

  const participants = computed(() => members.value.map((name) => {
    const local = name === username
    const state = mediaStates.get(name)
    const screenID = state?.screenStreamID
    return {
      name,
      local,
      audio: local ? media.microphoneEnabled.value : state?.audio ?? false,
      video: local ? media.cameraEnabled.value : state?.video ?? false,
      stream: local ? media.stream.value : remoteStreams.get(name)?.find((stream) => stream.id !== screenID) ?? null,
      connection: local ? status.value : peerStates.get(name) ?? 'connecting',
    }
  }))
  const screenShares = computed(() => {
    const shares = screenStream.value ? [{ name: username, local: true, stream: screenStream.value }] : []
    for (const [name, state] of mediaStates) {
      if (name === username || !state.screenStreamID) continue
      const stream = remoteStreams.get(name)?.find((stream) => stream.id === state.screenStreamID)
      if (stream) shares.push({ name, local: false, stream })
    }
    return shares
  })

  return { media, status, error, participants, screenShares, screenStream, screenPending, messages, toggleScreenShare, sendMessage, stop }
}
