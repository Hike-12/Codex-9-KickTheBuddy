export const PORTRAIT_EDGE = 320
export const PHOTO_UPLOAD_MB = 8
export const PHOTO_UPLOAD_PIXELS = 25_000_000
export const PHOTO_UPLOAD_EDGE = 8192
export const PORTRAIT_BYTES = 80 * 1024
export const SHARE_BYTES = 112 * 1024

export function photoDimensionsAllowed(width: number, height: number) {
  return width > 0 && height > 0 && width <= PHOTO_UPLOAD_EDGE && height <= PHOTO_UPLOAD_EDGE && width * height <= PHOTO_UPLOAD_PIXELS
}

export function portraitData(url: string) {
  const match = /^data:image\/(webp|png|jpeg);base64,([\da-z+/]+={0,2})$/i.exec(url)
  const type = match?.[1]?.toLowerCase()
  const data = match?.[2]
  if (!type || !data) return null
  const size = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
  return { type, data, size }
}

export async function loadFaceImage(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

export function encodePortrait(canvas: HTMLCanvasElement) {
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of [0.9, 0.75, 0.55, 0.38]) {
      const result = canvas.toDataURL(type, quality)
      const portrait = portraitData(result)
      if (portrait && portrait.size <= PORTRAIT_BYTES) return result
      if (!result.startsWith('data:' + type + ';')) break
    }
  }
  throw new Error('The crop could not be reduced to 80 KB')
}

export async function portraitForSharing(face: string) {
  const image = await loadFaceImage(face)
  if (!photoDimensionsAllowed(image.naturalWidth, image.naturalHeight)) throw new Error('The photo exceeds the dimension limit')
  const portrait = portraitData(face)
  if (portrait && portrait.size <= PORTRAIT_BYTES && image.naturalWidth <= PORTRAIT_EDGE && image.naturalHeight <= PORTRAIT_EDGE) return face
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PORTRAIT_EDGE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.drawImage(image, 0, 0, PORTRAIT_EDGE, PORTRAIT_EDGE)
  return encodePortrait(canvas)
}
