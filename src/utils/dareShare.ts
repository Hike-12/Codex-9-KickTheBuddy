import { profileFrom } from '../engine/model'
import type { Profile } from '../engine/model'

const PREFIX = '#dare='
const URL_LIMIT = 6000
const BODY_LIMIT = 12000

export async function loadFaceImage(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

async function thumbnail(source: string) {
  const image = await loadFaceImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.beginPath()
  ctx.arc(64, 64, 64, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(image, 0, 0, 128, 128)
  const webp = canvas.toDataURL('image/webp', 0.72)
  if (webp.startsWith('data:image/webp;')) return webp
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#bf9259'
  ctx.fillRect(0, 0, 128, 128)
  return canvas.toDataURL('image/jpeg', 0.72)
}

function encodeUrl(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function payload(profile: Profile) {
  const input = new TextEncoder().encode(JSON.stringify({ v: 1, ...profile }))
  if (typeof CompressionStream === 'undefined') return 'r.' + encodeUrl(input)
  const compressed = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate'))
  return 'z.' + encodeUrl(new Uint8Array(await new Response(compressed).arrayBuffer()))
}

async function uncompress(bytes: Uint8Array<ArrayBuffer>) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let count = 0
  let text = ''
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return text + decoder.decode()
      count += next.value.byteLength
      if (count > BODY_LIMIT) throw new Error('Dare payload is too large')
      text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function readDare(hash: string): Promise<Profile | null> {
  if (!hash.startsWith(PREFIX) || hash.length > URL_LIMIT) return null
  const encoded = hash.slice(PREFIX.length)
  if (!/^[rz]\.[A-Za-z\d_-]+$/.test(encoded)) return null
  try {
    const bytes = Uint8Array.from(atob(encoded.slice(2).replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
    const text = encoded.startsWith('z.') ? await uncompress(bytes) : new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null || !('v' in value) || value.v !== 1) return null
    if (!('name' in value) || typeof value.name !== 'string' || !value.name.trim()) return null
    return profileFrom(value)
  } catch {
    return null
  }
}

export async function createDareLink(profile: Profile, location: string) {
  const url = new URL(location)
  const compact = profile.face ? await thumbnail(profile.face).catch(() => null) : null
  url.hash = PREFIX + await payload({ ...profile, face: compact })
  if (url.href.length > URL_LIMIT && compact) {
    url.hash = PREFIX + await payload({ ...profile, face: null })
    return { url: url.href, photoOmitted: true }
  }
  return { url: url.href, photoOmitted: Boolean(profile.face && !compact) }
}

export async function copyDareLink(profile: Profile) {
  const result = createDareLink(profile, window.location.href)
  const clipboard = navigator.clipboard
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const text = result.then(({ url }) => new Blob([url], { type: 'text/plain' }))
      await clipboard.write([new ClipboardItem({ 'text/plain': text })])
      return await result
    } catch {
      // Some browsers allow writeText but gate ClipboardItem separately.
    }
  }
  const link = await result
  if (!clipboard?.writeText) throw new Error('Clipboard is unavailable on this page')
  await clipboard.writeText(link.url)
  return link
}
