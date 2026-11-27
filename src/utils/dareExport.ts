const CLIP_MS = 5000
const CLIP_TYPES = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']

function fileName(name: string) {
  return name.normalize('NFC').replace(/\p{Script=Latin}+/gu, text =>
    text.normalize('NFD').replace(/\p{M}/gu, '')).toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 44) || 'buddy'
}

export function createClipFile(blob: Blob, name: string) {
  const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm'
  return new File([blob], 'buddy-dare-' + fileName(name) + '.' + extension, { type: 'video/' + extension })
}

export function canShareDare(file: File) {
  try {
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true
  } catch {
    return false
  }
}

export async function shareDare(file: File, signal: AbortSignal) {
  if (signal.aborted) return 'canceled'
  if (canShareDare(file)) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'canceled'
    }
  }
  if (signal.aborted) return 'canceled'
  downloadDare(file, signal)
  return 'downloaded'
}

export function downloadDare(file: File, signal: AbortSignal) {
  if (signal.aborted) return
  const link = document.createElement('a')
  const url = URL.createObjectURL(file)
  link.href = url
  link.download = file.name
  document.body.append(link)
  const release = () => {
    URL.revokeObjectURL(url)
    window.clearTimeout(timer)
    signal.removeEventListener('abort', release)
  }
  const timer = window.setTimeout(release, 1500)
  signal.addEventListener('abort', release, { once: true })
  try { link.click() }
  finally { link.remove() }
}

function recordingTypes() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return []
  return CLIP_TYPES.filter(type => MediaRecorder.isTypeSupported(type))
}

export function canRecordClip() { return recordingTypes().length > 0 }

export function recordDareClip(
  canvas: HTMLCanvasElement,
  audioTrack: MediaStreamTrack,
  onSecond: (seconds: number) => void,
  signal: AbortSignal,
) {
  return new Promise<Blob>((resolve, reject) => {
    const types = recordingTypes()
    if (!types.length) { reject(new Error('Video recording is unavailable')); return }
    if (signal.aborted) { reject(signal.reason); return }

    const tracks: MediaStreamTrack[] = []
    const chunks: Blob[] = []
    let recorder: MediaRecorder | undefined
    let selectedType = ''
    let timer: number | undefined
    let countdown: number | undefined
    let finished = false

    function cleanup() {
      window.clearTimeout(timer)
      window.clearInterval(countdown)
      signal.removeEventListener('abort', cancel)
      for (const track of tracks) track.stop()
    }

    function finish(error?: unknown) {
      if (finished) return
      finished = true
      cleanup()
      if (error !== undefined) reject(error)
      else {
        const blob = new Blob(chunks, { type: recorder?.mimeType || selectedType })
        if (blob.size) resolve(blob)
        else reject(new Error('The recording did not contain frames'))
      }
    }

    function cancel() {
      try { if (recorder && recorder.state !== 'inactive') recorder.stop() }
      finally { finish(signal.reason) }
    }

    try {
      tracks.push(...canvas.captureStream(60).getVideoTracks())
      tracks.push(audioTrack.clone())
      const stream = new MediaStream(tracks)
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) throw new Error('The game capture did not provide both tracks')
      for (const mimeType of types) {
        try {
          const candidate = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1800000, audioBitsPerSecond: 96000 })
          candidate.start()
          recorder = candidate
          selectedType = mimeType
          break
        } catch {
          // A browser can advertise a codec that fails to open for this stream.
        }
      }
      if (!recorder) throw new Error('A video encoder could not start')
      const capture = recorder
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      capture.onstop = () => finish()
      capture.onerror = () => finish(new Error('The browser stopped the recording'))
      signal.addEventListener('abort', cancel, { once: true })
      const ends = performance.now() + CLIP_MS
      onSecond(CLIP_MS / 1000)
      countdown = window.setInterval(() => onSecond(Math.max(0, Math.ceil((ends - performance.now()) / 1000))), 1000)
      timer = window.setTimeout(() => {
        if (capture.state !== 'inactive') capture.stop()
      }, CLIP_MS)
    } catch (error) {
      finish(error)
    }
  })
}
