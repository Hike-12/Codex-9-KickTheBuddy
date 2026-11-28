import { get, put } from '@vercel/blob'
import { imageSize } from 'image-size'
import { profileFrom } from '../src/engine/model.js'
import { DARE_ID } from '../src/utils/dareLink.js'
import { PORTRAIT_BYTES, PORTRAIT_EDGE, portraitData, SHARE_BYTES } from '../src/utils/portrait.js'

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' }
const pathname = (id: string) => `dares/${id}.json`

async function readBody(request: Request) {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return text + decoder.decode()
      size += value.byteLength
      if (size > SHARE_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

function permittedPortrait(face: string) {
  const portrait = portraitData(face)
  if (!portrait || portrait.size > PORTRAIT_BYTES) return false
  try {
    const bytes = Uint8Array.from(atob(portrait.data), char => char.charCodeAt(0))
    const { width, height, type } = imageSize(bytes)
    const format = portrait.type === 'jpeg' ? 'jpg' : portrait.type
    return format === type && width > 0 && width <= PORTRAIT_EDGE && height > 0 && height <= PORTRAIT_EDGE
  } catch {
    return false
  }
}

async function saveDare(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403, headers })
  if (request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') {
    return new Response(null, { status: 415, headers })
  }
  if (Number(request.headers.get('content-length')) > SHARE_BYTES) return new Response(null, { status: 413, headers })

  let value: unknown
  try {
    const text = await readBody(request)
    if (text === null) return new Response(null, { status: 413, headers })
    value = JSON.parse(text)
  } catch {
    return new Response(null, { status: 400, headers })
  }
  const profile = profileFrom(value)
  if (!profile || typeof value !== 'object' || !value || !('name' in value) || typeof value.name !== 'string' || !value.name.trim() ||
      ('face' in value && value.face !== profile.face) || (profile.face && !permittedPortrait(profile.face))) {
    return new Response(null, { status: 400, headers })
  }

  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const id = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_')
  try {
    await put(pathname(id), JSON.stringify(profile), { access: 'private', contentType: 'application/json' })
    return Response.json({ id }, { status: 201, headers })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}

async function loadDare(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !DARE_ID.test(id)) return new Response(null, { status: 400, headers })
  try {
    const blob = await get(pathname(id), { access: 'private' })
    if (!blob) return new Response(null, { status: 404, headers })
    return new Response(blob.stream, {
      headers: { ...headers, 'Content-Type': 'application/json', 'Vercel-CDN-Cache-Control': 'public, s-maxage=600' },
    })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}

export default {
  fetch(request: Request) {
    if (request.method === 'POST') return saveDare(request)
    if (request.method === 'GET') return loadDare(request)
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, POST' } })
  },
}
