import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent, PointerEvent } from 'react'
import { clamp, isOutfit, OUTFITS } from '../engine/model'
import type { Profile } from '../engine/model'
import { Icon } from './Icon'

const SIZE = 320
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
type Offset = { x: number; y: number }

async function decode(url: string) {
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}

function cropBounds(image: HTMLImageElement, zoom: number, offset: Offset) {
  const scale = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight) * zoom
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  return {
    width, height,
    offset: {
      x: clamp(offset.x, -(width - SIZE) / 2, (width - SIZE) / 2),
      y: clamp(offset.y, -(height - SIZE) / 2, (height - SIZE) / 2),
    },
  }
}

function drawCrop(ctx: CanvasRenderingContext2D, image: HTMLImageElement, zoom: number, offset: Offset) {
  const crop = cropBounds(image, zoom, offset)
  ctx.drawImage(image, (SIZE - crop.width) / 2 + crop.offset.x, (SIZE - crop.height) / 2 + crop.offset.y, crop.width, crop.height)
}

export function FaceCropModal({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (profile: Profile) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const request = useRef(0)
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [face, setFace] = useState(profile.face)
  const [dirtyCrop, setDirtyCrop] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const [name, setName] = useState(profile.name)
  const [roasts, setRoasts] = useState(profile.roasts.join('\n'))
  const [blend, setBlend] = useState(profile.blend)
  const [outfit, setOutfit] = useState(profile.outfit)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
    if (!profile.face) return
    const id = ++request.current
    void decode(profile.face).then(value => {
      if (id === request.current) setImage(value)
    }).catch(() => {
      if (id === request.current) setError('The saved photo could not be opened. Choose a new image.')
    })
    return () => { request.current++ }
  }, [profile.face])

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
    if (!ALLOWED_TYPES.has(file.type) || file.size > 12 * 1024 * 1024) {
      setError('Choose a PNG, JPG, or WebP under 12 MB.')
      return
    }
    setError('')
    setLoading(true)
    const id = ++request.current
    const url = URL.createObjectURL(file)
    try {
      const selected = await decode(url)
      if (id !== request.current) return
      setImage(selected)
      setDirtyCrop(true)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    } catch {
      if (id === request.current) setError('This image could not be opened. Try another file.')
    } finally {
      URL.revokeObjectURL(url)
      if (id === request.current) setLoading(false)
    }
  }

  function pan(dx: number, dy: number) {
    if (!image) return
    setDirtyCrop(true)
    setOffset(current => cropBounds(image, zoom, { x: current.x + dx, y: current.y + dy }).offset)
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    const scale = SIZE / event.currentTarget.getBoundingClientRect().width
    pan((event.clientX - active.x) * scale, (event.clientY - active.y) * scale)
    active.x = event.clientX
    active.y = event.clientY
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
    let cropped = face
    if (image && dirtyCrop) {
      const output = document.createElement('canvas')
      output.width = output.height = SIZE
      const ctx = output.getContext('2d')
      if (!ctx) return
      drawCrop(ctx, image, zoom, offset)
      cropped = output.toDataURL('image/webp', 0.91)
    }
    onSave({
      face: cropped, blend, outfit, name: name.trim() || 'Buddy',
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
                aria-label="Circular face crop. Use the arrow keys to pan the photo."
                onKeyDown={keyPan} onPointerMove={pointerMove}
                onPointerDown={event => {
                  if (!image || event.button !== 0 || drag.current) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
                }}
                onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) drag.current = null }}
              />
            </div>
            <label className="file-button control">
              <Icon name="upload" size={17} /> {loading ? 'Opening photo…' : 'Choose photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void selectFile(event) }} />
            </label>
            {(image || face) && <button className="text-btn" type="button" onClick={() => {
              request.current++
              setFace(null); setImage(null); setDirtyCrop(false); setLoading(false)
              setZoom(1); setOffset({ x: 0, y: 0 }); setError('')
            }}>Use stitched face</button>}
            {error && <p className="field-error" role="alert">{error}</p>}
          </section>
          <section className="fields" aria-label="Friend settings">
            <label className="field">Friend’s name
              <input autoFocus maxLength={24} value={name} onChange={event => setName(event.target.value)} placeholder="Buddy" />
            </label>
            <label className="field">Custom roasts <span className="field-hint">One per line</span>
              <textarea rows={4} maxLength={688} value={roasts} onChange={event => setRoasts(event.target.value)} placeholder={'Take it easy!\nIs that all you got?'} />
            </label>
            <label className="field range-field"><span>Photo zoom</span><output>{Math.round(zoom * 100)}%</output>
              <input type="range" min={1} max={3} step={0.01} value={zoom} disabled={!image} onChange={event => {
                const value = Number(event.target.value)
                setZoom(value)
                setDirtyCrop(true)
                if (image) setOffset(cropBounds(image, value, offset).offset)
              }} />
            </label>
            <label className="field outfit-field">Outfit color
              <select value={outfit} onChange={event => {
                if (isOutfit(event.target.value)) setOutfit(event.target.value)
              }}>
                {Object.entries(OUTFITS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
              </select>
            </label>
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
