import { get, put } from '@vercel/blob'
import { profileFrom } from '../src/engine/model'
import { DARE_ID } from '../src/utils/dareLink'

const MAX_PROFILE_SIZE = 604_000
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const pathname = (id: string) => `dares/${id}.json`

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403, headers })
  if (request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') {
    return new Response(null, { status: 415, headers })
  }
  if (Number(request.headers.get('content-length')) > MAX_PROFILE_SIZE) return new Response(null, { status: 413, headers })

  let value: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_PROFILE_SIZE) return new Response(null, { status: 413, headers })
    value = JSON.parse(text)
  } catch {
    return new Response(null, { status: 400, headers })
  }
  const profile = profileFrom(value)
  if (!profile || typeof value !== 'object' || !value || !('name' in value) || typeof value.name !== 'string' || !value.name.trim() ||
      ('face' in value && value.face !== profile.face)) return new Response(null, { status: 400, headers })

  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const id = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_')
  try {
    await put(pathname(id), JSON.stringify(profile), { access: 'private', contentType: 'application/json' })
    return Response.json({ id }, { status: 201, headers })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !DARE_ID.test(id)) return new Response(null, { status: 400, headers })
  try {
    const blob = await get(pathname(id), { access: 'private' })
    if (!blob) return new Response(null, { status: 404, headers })
    return new Response(blob.stream, { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch {
    return new Response(null, { status: 503, headers })
  }
}
