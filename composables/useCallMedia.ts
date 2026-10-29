import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'

export interface CallMedia {
  stream: ShallowRef<MediaStream | null>
  cameraEnabled: Ref<boolean>
  microphoneEnabled: Ref<boolean>
  isRequesting: Ref<boolean>
  error: Ref<string>
  mediaVersion: Ref<number>
  requestMedia(): Promise<void>
  toggleCamera(): Promise<void>
  toggleMicrophone(): Promise<void>
  stopMedia(): void
}

function createCallMedia(): CallMedia {
  const stream = shallowRef<MediaStream | null>(null)
  const cameraEnabled = ref(false)
  const microphoneEnabled = ref(false)
  const isRequesting = ref(false)
  const error = ref('')
  const mediaVersion = ref(0)
  let generation = 0
  let pending: Promise<void> | null = null

  const liveTracks = (kind: 'audio' | 'video') =>
    stream.value?.getTracks().filter(track => track.kind === kind && track.readyState === 'live') ?? []

  function updateFlags() {
    cameraEnabled.value = liveTracks('video').some(track => track.enabled)
    microphoneEnabled.value = liveTracks('audio').some(track => track.enabled)
  }

  function permissionError(cause: unknown) {
    const name = cause instanceof Error ? cause.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Device access was not allowed. Check camera and microphone permissions in your browser’s address bar, then try again. You can also join with devices off.'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'The requested camera or microphone was not found. Connect a device and try again, or join with devices off.'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return 'Your device could not be opened. Close other apps using your camera or microphone and try again.'
    }
    if (name === 'SecurityError') return 'Your browser has blocked device access on this page. Check its site permissions, or join with devices off.'
    return 'Could not access your devices. Check your browser’s site permissions and device connection, then try again.'
  }

  async function acquire(audio: boolean, video: boolean): Promise<void> {
    const requestedGeneration = generation
    if (pending) await pending
    if (requestedGeneration !== generation) return
    error.value = ''
    if (typeof window === 'undefined') return
    if (!window.isSecureContext) {
      error.value = 'Camera and microphone access requires HTTPS (or localhost). Open a secure link, or join with devices off.'
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'This browser does not support camera and microphone access. Try a current browser, or join with devices off.'
      return
    }
    const missingAudio = audio && liveTracks('audio').length === 0
    const missingVideo = video && liveTracks('video').length === 0
    if (!missingAudio && !missingVideo) {
      if (audio) liveTracks('audio').forEach(track => { track.enabled = true })
      if (video) liveTracks('video').forEach(track => { track.enabled = true })
      updateFlags()
      return
    }
    isRequesting.value = true
    const operation = (async () => {
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: missingAudio, video: missingVideo })
        if (requestedGeneration !== generation) {
          acquired.getTracks().forEach(track => track.stop())
          return
        }
        if (!stream.value) stream.value = new MediaStream()
        stream.value.getTracks().filter(track => track.readyState === 'ended').forEach(track => stream.value!.removeTrack(track))
        acquired.getTracks().forEach(track => {
          stream.value!.addTrack(track)
          track.onended = () => {
            if (requestedGeneration !== generation) return
            updateFlags()
            mediaVersion.value++
          }
        })
        if (audio) liveTracks('audio').forEach(track => { track.enabled = true })
        if (video) liveTracks('video').forEach(track => { track.enabled = true })
        updateFlags()
        mediaVersion.value++
      } catch (cause) {
        if (requestedGeneration === generation) error.value = permissionError(cause)
      } finally {
        if (requestedGeneration === generation) {
          isRequesting.value = false
          pending = null
        }
      }
    })()
    pending = operation
    await operation
  }

  async function toggleCamera(): Promise<void> {
    if (!cameraEnabled.value) return acquire(false, true)
    error.value = ''
    liveTracks('video').forEach(track => { track.enabled = false })
    updateFlags()
  }

  async function toggleMicrophone(): Promise<void> {
    if (!microphoneEnabled.value) return acquire(true, false)
    error.value = ''
    liveTracks('audio').forEach(track => { track.enabled = false })
    updateFlags()
  }

  function stopMedia() {
    generation++
    stream.value?.getTracks().forEach(track => { track.onended = null; track.stop() })
    stream.value = null
    cameraEnabled.value = false
    microphoneEnabled.value = false
    isRequesting.value = false
    error.value = ''
    pending = null
    mediaVersion.value++
  }

  return { stream, cameraEnabled, microphoneEnabled, isRequesting, error, mediaVersion,
    requestMedia: () => acquire(true, true), toggleCamera, toggleMicrophone, stopMedia }
}

let clientMedia: CallMedia | undefined

/** Keep native media out of Nuxt's serialized state and isolated from SSR requests. */
export function useCallMedia() {
  if (import.meta.server) return createCallMedia()
  return clientMedia ??= createCallMedia()
}
