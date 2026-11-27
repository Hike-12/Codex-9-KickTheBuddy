import { ellipse, line } from '../engine/canvasDraw'
import { OUTFITS } from '../engine/model'
import type { DareStats, Profile } from '../engine/model'
import { loadFaceImage } from './dareShare'

const CLIP_MS = 5000
const WEBM = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']

function fileName(name: string) {
  return name.normalize('NFC').replace(/\p{Script=Latin}+/gu, text =>
    text.normalize('NFD').replace(/\p{M}/gu, '')).toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 44) || 'buddy'
}

export function downloadDare(blob: Blob, name: string, kind: 'clip' | 'scorecard', signal: AbortSignal) {
  if (signal.aborted) return
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = kind === 'clip' ? 'buddy-dare-' + fileName(name) + '.webm' : 'buddy-dare-' + fileName(name) + '-damage-report.png'
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

function webmTypes() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return []
  return WEBM.filter(type => MediaRecorder.isTypeSupported(type))
}

export function canRecordClip() { return webmTypes().length > 0 }

export function recordDareClip(
  canvas: HTMLCanvasElement,
  audioTrack: MediaStreamTrack,
  onSecond: (seconds: number) => void,
  signal: AbortSignal,
) {
  return new Promise<Blob>((resolve, reject) => {
    const types = webmTypes()
    if (!types.length) { reject(new Error('WebM recording is unavailable')); return }
    if (signal.aborted) { reject(signal.reason); return }

    const tracks: MediaStreamTrack[] = []
    const chunks: Blob[] = []
    let recorder: MediaRecorder | undefined
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
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' })
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
          break
        } catch {
          // A browser can advertise a codec that fails to open for this stream.
        }
      }
      if (!recorder) throw new Error('A WebM encoder could not start')
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

type Pen = CanvasRenderingContext2D
const INK = '#35291f'
const MUTED = '#6d5641'
const PAPER = '#f1e0bd'

function headline(ctx: Pen, text: string, x: number, y: number, width: number, size: number, font: string) {
  ctx.font = font.replace('{size}', String(size))
  while (size > 18 && ctx.measureText(text).width > width) {
    ctx.font = font.replace('{size}', String(--size))
  }
  ctx.fillText(text, x, y, width)
}

function wrap(ctx: Pen, message: string, width: number) {
  const rows: string[] = []
  let row = ''
  for (const word of message.split(/\s+/)) {
    const next = row ? row + ' ' + word : word
    if (row && ctx.measureText(next).width > width) {
      rows.push(row)
      row = word
    } else row = next
  }
  if (row) rows.push(row)
  return rows
}

async function portrait(ctx: Pen, profile: Profile, x: number, y: number, radius: number) {
  const photo = profile.face ? await loadFaceImage(profile.face).catch(() => null) : null
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#bf9156'
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
  if (photo) ctx.drawImage(photo, -radius, -radius, radius * 2, radius * 2)
  if (photo && profile.blend) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = '#e3bd89'
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
    ctx.globalCompositeOperation = 'source-over'
  }
  if (!photo || profile.blend) {
    for (let row = -radius; row < radius; row += 5) {
      for (let col = -radius; col < radius; col += 5) {
        const thread = (row + col) / 5
        ctx.fillStyle = thread % 3 ? '#764e2930' : '#ffefb34c'
        if (thread % 2) ctx.fillRect(col, row + 1, 5, 1.1)
        else ctx.fillRect(col + 1, row, 1.1, 5)
      }
    }
  }
  if (!photo) {
    for (const [eyeX, eyeY] of [[-43, -18], [41, -13]] as const) {
      ellipse(ctx, eyeX + 2, eyeY + 2, 19, 19, '#795336')
      ellipse(ctx, eyeX, eyeY, 18, 18, '#342921')
      ellipse(ctx, eyeX - 2, eyeY - 2, 13, 13, '#4e3b2b')
      line(ctx, eyeX - 5, eyeY - 5, eyeX + 5, eyeY + 5, PAPER, 2.5)
      line(ctx, eyeX + 5, eyeY - 5, eyeX - 5, eyeY + 5, PAPER, 2.5)
    }
    ctx.beginPath()
    ctx.moveTo(-30, 25)
    ctx.quadraticCurveTo(0, 48, 33, 22)
    ctx.strokeStyle = INK
    ctx.lineWidth = 3.4
    ctx.stroke()
    for (const [sx, sy] of [[-22, 30], [-11, 34], [0, 35], [12, 34], [23, 28]] as const) {
      line(ctx, sx - 1, sy - 4, sx + 1, sy + 4, INK, 1.7)
    }
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = OUTFITS[profile.outfit].color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(x, y, radius + 9, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([4, 5])
  ctx.strokeStyle = MUTED
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, radius + 17, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export async function createScorecard(profile: Profile, stats: DareStats) {
  const width = 720
  const height = 920
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.scale(2, 2)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, width, height)
  let seed = 132
  for (let i = 0; i < 6300; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const x = (seed % 1440) / 2
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const y = (seed % 1840) / 2
    ctx.fillStyle = i % 3 ? '#805e3215' : '#fff4d744'
    ctx.fillRect(x, y, 1.5 + i % 4 * 0.3, 0.65)
  }
  const edge = 30
  ctx.lineWidth = 2
  ctx.strokeStyle = INK
  ctx.strokeRect(edge, edge, width - edge * 2, height - edge * 2)
  ctx.strokeStyle = '#846a4d'
  ctx.lineWidth = 1
  ctx.strokeRect(edge + 7, edge + 7, width - (edge + 7) * 2, height - (edge + 7) * 2)
  const accent = OUTFITS[profile.outfit].color
  ctx.fillStyle = accent
  ctx.fillRect(60, 55, 600, 43)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff0d1'
  ctx.font = 'bold 15px monospace'
  ctx.fillText('J U T E   R O O M', 360, 82)
  ctx.fillStyle = INK
  ctx.font = 'bold 56px Georgia, serif'
  ctx.fillText('Official Dare', 360, 163)
  ctx.font = 'bold 53px Georgia, serif'
  ctx.fillText('Damage Report', 360, 217)
  line(ctx, 103, 242, 617, 242, MUTED, 1)
  await portrait(ctx, profile, 360, 371, 91)
  ctx.fillStyle = INK
  headline(ctx, profile.name, 360, 519, 580, 45, 'bold {size}px Georgia, serif')

  const metrics = [
    { label: 'TOTAL DAMAGE DEALT', value: stats.damage.toLocaleString() + ' pts' },
    { label: 'MAX COMBO', value: '×' + stats.maxCombo.toLocaleString() },
    { label: 'COINS COLLECTED', value: '$' + stats.coins.toLocaleString() },
  ]
  const start = 63
  const cells = 198
  ctx.fillStyle = '#e7d3ad'
  ctx.fillRect(start, 555, cells * 3, 100)
  line(ctx, start, 555, start + cells * 3, 555, MUTED)
  line(ctx, start, 655, start + cells * 3, 655, MUTED)
  metrics.forEach(({ label, value }, i) => {
    const x = start + cells * (i + 0.5)
    if (i) line(ctx, start + cells * i, 568, start + cells * i, 641, '#a8906d')
    ctx.fillStyle = MUTED
    ctx.font = 'bold 12px monospace'
    ctx.fillText(label, x, 583)
    ctx.fillStyle = INK
    headline(ctx, value, x, 626, 182, 37, 'bold {size}px Georgia, serif')
  })

  ctx.fillStyle = MUTED
  ctx.font = 'bold 13px monospace'
  ctx.fillText('ROAST OF THE ROUND', 360, 691)
  ctx.fillStyle = INK
  const quoted = stats.roast ? '“' + stats.roast + '”' : 'No roast triggered yet'
  let roastSize = 27
  ctx.font = 'italic ' + roastSize + 'px Georgia, serif'
  let rows = wrap(ctx, quoted, 517)
  while (rows.length > 3 && roastSize > 12) {
    ctx.font = 'italic ' + --roastSize + 'px Georgia, serif'
    rows = wrap(ctx, quoted, 517)
  }
  rows.forEach((row, i) => ctx.fillText(row, 360, 726 + i * Math.min(30, 66 / Math.max(1, rows.length - 1)), 517))

  ctx.save()
  ctx.translate(360, 835)
  ctx.rotate(-0.074)
  const stamp = stats.destroyed ? '#983f30' : '#486451'
  ctx.strokeStyle = stamp
  ctx.fillStyle = stamp
  ctx.lineWidth = 3.5
  ctx.strokeRect(-143, -22, 286, 52)
  ctx.lineWidth = 1
  ctx.strokeRect(-138, -17, 276, 42)
  ctx.font = 'bold 29px monospace'
  ctx.fillText(stats.destroyed ? 'DESTROYED' : 'SURVIVED', 0, 15)
  ctx.restore()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The scorecard could not be encoded')), 'image/png')
  })
}
