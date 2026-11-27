import { profileFrom } from '../engine/model'
import type { Profile } from '../engine/model'
import { DARE_API, DARE_ID, SHORT_DARE_PREFIX } from './dareLink'

const LEGACY_PREFIX = '#dare='
const URL_LIMIT = 6000
const BODY_LIMIT = 12000

export async function loadFaceImage(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
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

export function isDareHash(hash: string) {
  return hash.startsWith(SHORT_DARE_PREFIX) || hash.startsWith(LEGACY_PREFIX)
}

export async function readDare(hash: string, signal?: AbortSignal): Promise<Profile | null> {
  if (hash.startsWith(SHORT_DARE_PREFIX)) {
    const id = hash.slice(SHORT_DARE_PREFIX.length)
    if (!DARE_ID.test(id)) return null
    try {
      const response = await fetch(DARE_API + '?id=' + id, { signal })
      if (!response.ok) return null
      return profileFrom(await response.json())
    } catch {
      return null
    }
  }
  if (!hash.startsWith(LEGACY_PREFIX) || hash.length > URL_LIMIT) return null
  const encoded = hash.slice(LEGACY_PREFIX.length)
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
  const response = await fetch(DARE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new Error('The dare link could not be saved')
  const result: unknown = await response.json()
  if (typeof result !== 'object' || !result || !('id' in result) || typeof result.id !== 'string' || !DARE_ID.test(result.id)) {
    throw new Error('The dare service returned an invalid link')
  }
  url.search = ''
  url.hash = SHORT_DARE_PREFIX + result.id
  return url.href
}

export async function copyDareLink(profile: Profile) {
  const result = createDareLink(profile, window.location.href)
  const clipboard = navigator.clipboard
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const text = result.then(url => new Blob([url], { type: 'text/plain' }))
      await clipboard.write([new ClipboardItem({ 'text/plain': text })])
      return await result
    } catch {
      // Some browsers allow writeText but gate ClipboardItem separately.
    }
  }
  const link = await result
  if (!clipboard?.writeText) throw new Error('Clipboard is unavailable on this page')
  await clipboard.writeText(link)
  return link
}
