import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent, PointerEvent } from 'react'
import { clamp, isOutfit, OUTFITS } from '../engine/model'
import type { Profile } from '../engine/model'
import { loadFaceImage } from '../utils/dareShare'
import { Icon } from './Icon'
import { OptionPicker } from './OptionPicker'

const SIZE = 320
const MAX_WORKING_EDGE = 2048
const OUTFIT_OPTIONS = Object.keys(OUTFITS).filter(isOutfit).map(value => ({ value, ...OUTFITS[value] }))
type Offset = { x: number; y: number }
type CropPose = { zoom: number; offset: Offset }
type CropImage = { source: CanvasImageSource; width: number; height: number }
const INITIAL_CROP: CropPose = { zoom: 1, offset: { x: 0, y: 0 } }

async function rasterType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...bytes.slice(8, 12))
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
  }
  return null
}

async function decode(url: string): Promise<CropImage> {
  const image = await loadFaceImage(url)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) throw new Error('Empty image')
  const ratio = MAX_WORKING_EDGE / Math.max(width, height)
  if (ratio >= 1) return { source: image, width, height }
  const reduced = document.createElement('canvas')
  reduced.width = Math.max(1, Math.round(width * ratio))
  reduced.height = Math.max(1, Math.round(height * ratio))
  const ctx = reduced.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, reduced.width, reduced.height)
  return { source: reduced, width: reduced.width, height: reduced.height }
}

function cropBounds(image: CropImage, zoom: number, offset: Offset) {
  const scale = Math.max(SIZE / image.width, SIZE / image.height) * zoom
  const width = image.width * scale
  const height = image.height * scale
  return {
    width, height,
    offset: {
      x: clamp(offset.x, -Math.max(0, width - SIZE) / 2, Math.max(0, width - SIZE) / 2),
      y: clamp(offset.y, -Math.max(0, height - SIZE) / 2, Math.max(0, height - SIZE) / 2),
    },
  }
}

function drawCrop(ctx: CanvasRenderingContext2D, image: CropImage, zoom: number, offset: Offset) {
  const crop = cropBounds(image, zoom, offset)
  ctx.drawImage(image.source, (SIZE - crop.width) / 2 + crop.offset.x, (SIZE - crop.height) / 2 + crop.offset.y, crop.width, crop.height)
}

function cropPoint(event: PointerEvent<HTMLCanvasElement>): Offset {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: (event.clientX - rect.left) * SIZE / rect.width, y: (event.clientY - rect.top) * SIZE / rect.height }
}

export function FaceCropModal({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (profile: Profile) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const request = useRef(0)
  const points = useRef(new Map<number, Offset>())
  const [image, setImage] = useState<CropImage | null>(null)
  const [face, setFace] = useState(profile.face)
  const [dirtyCrop, setDirtyCrop] = useState(false)
  const [{ zoom, offset }, setCrop] = useState(INITIAL_CROP)
  const [name, setName] = useState(profile.name)
  const [roasts, setRoasts] = useState(profile.roasts.join('\n'))
  const [customRoasts, setCustomRoasts] = useState(profile.customRoasts)
  const [blend, setBlend] = useState(profile.blend)
  const [outfit, setOutfit] = useState(profile.outfit)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const modal = dialog.current
    if (modal && !modal.open) modal.showModal()
    const id = ++request.current
    if (profile.face) void decode(profile.face).then(value => {
      if (id === request.current) setImage(value)
    }).catch(() => {
      if (id === request.current) setError('The saved photo could not be opened. Choose a new image.')
    })
    return () => { request.current++ }
  }, [profile.face])

  useEffect(() => {
    const modal = dialog.current
    const viewport = window.visualViewport
    if (!modal || !viewport) return
    const fit = () => modal.style.setProperty('--crop-viewport-height', `${Math.floor(viewport.height * 0.92)}px`)
    fit()
    viewport.addEventListener('resize', fit)
    return () => viewport.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const ctx = preview.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    if (image) {
      drawCrop(ctx, image, zoom, offset)
      if (blend) {
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = '#d7aa74'
        ctx.fillRect(0, 0, SIZE, SIZE)
        ctx.globalCompositeOperation = 'source-over'
      }
    } else {
      ctx.fillStyle = '#b98b52'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.strokeStyle = '#dbac7255'
      ctx.lineWidth = 1
      for (let i = 0; i < SIZE; i += 5) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, SIZE)
        ctx.moveTo(0, i)
        ctx.lineTo(SIZE, i)
        ctx.stroke()
      }
      for (const x of [108, 210]) {
        ctx.beginPath()
        ctx.arc(x, 137, 22, 0, 2 * Math.PI)
        ctx.fillStyle = '#3d3025'
        ctx.fill()
        ctx.strokeStyle = '#dcbd8a'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(x - 6, 131); ctx.lineTo(x + 6, 143)
        ctx.moveTo(x + 6, 131); ctx.lineTo(x - 6, 143)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(123, 185)
      ctx.quadraticCurveTo(160, 218, 200, 181)
      ctx.strokeStyle = '#4e3525'
      ctx.lineWidth = 4
      ctx.stroke()
    }
  }, [image, zoom, offset, blend])

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const id = ++request.current
    if (file.size > 12 * 1024 * 1024) {
      setLoading(false)
      setError('Choose a photo under 12 MB.')
      return
    }
    setError('')
    setLoading(true)
    let url: string | undefined
    try {
      const type = await rasterType(file)
      if (id !== request.current) return
      if (!type) {
        setError('Choose a PNG, JPG, WebP, AVIF, or HEIC photo.')
        return
      }
      url = URL.createObjectURL(file.type === type ? file : new Blob([file], { type }))
      const selected = await decode(url)
      if (id !== request.current) return
      setImage(selected)
      setDirtyCrop(true)
      points.current.clear()
      setCrop(INITIAL_CROP)
    } catch {
      if (id === request.current) setError('This image could not be opened. Try another file.')
    } finally {
      if (url) URL.revokeObjectURL(url)
      if (id === request.current) setLoading(false)
    }
  }

  function pan(dx: number, dy: number) {
    if (!image) return
    setDirtyCrop(true)
    setCrop(current => ({ ...current, offset: cropBounds(image, current.zoom, { x: current.offset.x + dx, y: current.offset.y + dy }).offset }))
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const active = points.current
    const previous = active.get(event.pointerId)
    if (!previous || !image) return
    const next = cropPoint(event)
    active.set(event.pointerId, next)
    const other = Array.from(active).find(([id]) => id !== event.pointerId)?.[1]
    if (!other) {
      pan(next.x - previous.x, next.y - previous.y)
      return
    }
    const before = Math.hypot(previous.x - other.x, previous.y - other.y)
    const after = Math.hypot(next.x - other.x, next.y - other.y)
    if (before < 1 || after < 1) return
    setDirtyCrop(true)
    setCrop(current => {
      const zoom = clamp(current.zoom * after / before, 1, 3)
      const ratio = zoom / current.zoom
      const offset = {
        x: (next.x + other.x - SIZE) / 2 - ((previous.x + other.x - SIZE) / 2 - current.offset.x) * ratio,
        y: (next.y + other.y - SIZE) / 2 - ((previous.y + other.y - SIZE) / 2 - current.offset.y) * ratio,
      }
      return { zoom, offset: cropBounds(image, zoom, offset).offset }
    })
  }

  function endPointer(event: PointerEvent<HTMLCanvasElement>) {
    points.current.delete(event.pointerId)
  }

  function keyPan(event: KeyboardEvent<HTMLCanvasElement>) {
    const directions: Record<string, Offset> = { ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 }, ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 } }
    const delta = directions[event.key]
    if (!delta || !image) return
    event.preventDefault()
    pan(delta.x, delta.y)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    let cropped = face
    if (image && dirtyCrop) {
      const output = document.createElement('canvas')
      output.width = output.height = SIZE
      const ctx = output.getContext('2d')
      if (!ctx) return
      try {
        drawCrop(ctx, image, zoom, offset)
        cropped = output.toDataURL('image/webp', 0.91)
      } catch {
        setError('Couldn’t save this crop. Try another photo.')
        return
      }
    }
    onSave({
      face: cropped, blend, outfit, customRoasts, name: name.trim() || 'Buddy',
      roasts: roasts.split(/\r?\n/).map(line => line.trim().slice(0, 85)).filter(Boolean).slice(0, 8),
    })
  }

  return (
    <dialog className="face-modal" ref={dialog} aria-labelledby="face-title" onClose={onClose}>
      <header className="modal-heading">
        <div>
          <h2 id="face-title">Swap Friend’s Face</h2>
          <p>Give the ragdoll a familiar face and a few new lines.</p>
        </div>
        <button type="button" className="control icon-btn" onClick={() => dialog.current?.close()} aria-label="Close customizer"><Icon name="close" /></button>
      </header>
      <form onSubmit={save}>
        <div className="modal-grid">
          <section className="crop-pane" aria-label="Face photo">
            <div className="crop-ring">
              <canvas
                ref={preview} width={SIZE} height={SIZE}
                className={image ? 'has-photo' : undefined}
                tabIndex={image ? 0 : undefined}
                aria-label="Circular face crop. Drag or use arrow keys to pan. Pinch to zoom."
                onKeyDown={keyPan} onPointerMove={pointerMove}
                onPointerDown={event => {
                  if (!image || event.button !== 0 || points.current.size >= 2) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  points.current.set(event.pointerId, cropPoint(event))
                }}
                onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
              />
            </div>
            <div className="photo-actions">
              <label className="file-button control">
                <Icon name="upload" size={17} /> {loading ? 'Opening photo…' : 'Choose photo'}
                <input type="file" accept="image/*" onChange={event => { void selectFile(event) }} />
              </label>
              <label className="file-button control camera-button">
                Camera
                <input type="file" accept="image/*" capture="user" onChange={event => { void selectFile(event) }} />
              </label>
            </div>
            {(image || face) && <button className="text-btn" type="button" onClick={() => {
              request.current++
              setFace(null); setImage(null); setDirtyCrop(false); setLoading(false)
              points.current.clear(); setCrop(INITIAL_CROP); setError('')
            }}>Use stitched face</button>}
            {error && <p className="field-error" role="alert">{error}</p>}
          </section>
          <section className="fields" aria-label="Friend settings">
            <label className="field">Friend’s name
              <input maxLength={24} value={name} onChange={event => setName(event.target.value)} placeholder="Buddy" />
            </label>
            <label className="check-field"><input type="checkbox" checked={customRoasts} onChange={event => setCustomRoasts(event.target.checked)} /> Use custom roasts only</label>
            <label className="field">Custom roasts <span className="field-hint">One per line. An empty list is silent when enabled.</span>
              <textarea rows={4} maxLength={688} value={roasts} onChange={event => {
                if (!roasts.trim() && event.target.value.trim()) setCustomRoasts(true)
                setRoasts(event.target.value)
              }} placeholder={'Take it easy!\nIs that all you got?'} />
            </label>
            <label className="field range-field"><span>Photo zoom</span><output>{Math.round(zoom * 100)}%</output>
              <input type="range" min={1} max={3} step={0.01} value={zoom} disabled={!image} onChange={event => {
                const value = Number(event.target.value)
                if (!image) return
                setDirtyCrop(true)
                setCrop(current => ({ zoom: value, offset: cropBounds(image, value, current.offset).offset }))
              }} />
            </label>
            <div className="field outfit-field">Outfit color
              <OptionPicker label="Outfit color" value={outfit} options={OUTFIT_OPTIONS} onChange={setOutfit} />
            </div>
            <label className="check-field"><input type="checkbox" checked={blend} onChange={event => setBlend(event.target.checked)} /> Burlap Fabric Blend</label>
          </section>
        </div>
        <footer className="modal-footer">
          <button type="button" className="control" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="control primary" disabled={loading}>Save friend</button>
        </footer>
      </form>
    </dialog>
  )
}
