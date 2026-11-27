import type { Vector } from 'matter-js'
import type { GameDirector } from './GameDirector'
import { clamp } from './model'
import type { Limb, Profile, Room, Surface } from './model'

import { ellipse, line, path, shape } from './canvasDraw'
import type { Pen } from './canvasDraw'
import { GadgetRenderer } from './GadgetRenderer'
import type { GadgetSystem } from './GadgetSystem'
type Drag = { from: Vector; to: Vector }

function buffer(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  return { canvas, ctx }
}

function randomFrom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function star(ctx: Pen, x: number, y: number, size: number, rotation: number, color: string) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? size * 0.43 : size
    const angle = rotation + i * Math.PI / 5
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function makeWeave() {
  const { canvas, ctx } = buffer(90, 90)
  const random = randomFrom(49)
  for (let y = 0; y < 90; y += 3) {
    for (let x = 0; x < 90; x += 3) {
      const shade = random()
      ctx.fillStyle = shade > 0.58 ? 'rgba(255,226,170,0.26)' : 'rgba(43,25,17,0.25)'
      if ((x / 3 + y / 3) % 2) ctx.fillRect(x, y + 0.4, 3, 1.2)
      else ctx.fillRect(x + 0.25, y, 1.1, 3)
    }
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = i % 2 ? '#fff1c338' : '#23190e3a'
    ctx.fillRect(random() * 90, random() * 90, 1 + random() * 2, 0.7)
  }
  return canvas
}

function makeShadow() {
  const { canvas, ctx } = buffer(180, 40)
  ctx.scale(1, 0.22)
  const gradient = ctx.createRadialGradient(90, 90, 2, 90, 90, 90)
  gradient.addColorStop(0, '#21140bb0')
  gradient.addColorStop(0.55, '#21140b50')
  gradient.addColorStop(1, '#21140b00')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 180, 182)
  return canvas
}

function makeSmudge() {
  const { canvas, ctx } = buffer(60, 60)
  const random = randomFrom(711)
  for (let i = 0; i < 100; i++) {
    const angle = random() * Math.PI * 2
    const r = random() * 22
    ellipse(ctx, 30 + Math.cos(angle) * r, 30 + Math.sin(angle) * r * 0.65, 0.5 + random() * 2.2, 0.7 + random(), '#33241b44')
  }
  return canvas
}

export class RagdollRenderer {
  private ctx: Pen
  private backdrop = buffer(1, 1)
  private weave = makeWeave()
  private shadow = makeShadow()
  private smudge = makeSmudge()
  private gadgetArt = new GadgetRenderer()
  private limbs = new Map<string, HTMLCanvasElement>()
  private photo: HTMLCanvasElement | null = null
  private faceRequest = 0
  private scale = 1

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    this.ctx = ctx
  }

  dispose() {
    this.faceRequest++
  }

  setProfile(profile: Profile) {
    const request = ++this.faceRequest
    if (!profile.face) {
      this.photo = null
      return
    }
    const image = new Image()
    image.onload = () => {
      if (request !== this.faceRequest) return
      const { canvas, ctx } = buffer(156, 156)
      ctx.scale(2, 2)
      ctx.beginPath()
      ctx.arc(39, 39, 36, 0, Math.PI * 2)
      ctx.save()
      ctx.clip()
      ctx.drawImage(image, 3, 3, 72, 72)
      if (profile.blend) {
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = '#d7aa74'
        ctx.fillRect(0, 0, 78, 78)
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = ctx.createPattern(this.weave, 'repeat') ?? 'transparent'
        ctx.fillRect(0, 0, 78, 78)
      }
      ctx.restore()
      if (profile.blend) {
        ctx.strokeStyle = '#68432a'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.stroke()
      }
      this.photo = canvas
    }
    image.src = profile.face
  }

  resize(room: Room, cssScale: number, dpr: number) {
    const width = Math.max(1, Math.round(room.width * cssScale * dpr))
    const height = Math.max(1, Math.round(room.height * cssScale * dpr))
    if (this.canvas.width === width && this.canvas.height === height && this.scale === cssScale * dpr) return
    this.scale = cssScale * dpr
    this.canvas.width = this.backdrop.canvas.width = width
    this.canvas.height = this.backdrop.canvas.height = height
    this.backdrop.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    this.drawRoom(this.backdrop.ctx, room)
  }

  private drawRoom(ctx: Pen, room: Room) {
    const { width: w, height: h, left, right, ceiling, floor } = room
    const random = randomFrom(221)
    const recess = Math.min(37, w * 0.045)
    const lip = Math.min(14, w * 0.021)
    const backL = left + recess
    const backR = right - recess
    const backY = ceiling + recess * 0.58
    const baseY = floor - h * 0.115
    const vanishingX = w * 0.5

    ctx.fillStyle = '#2e211a'
    ctx.fillRect(0, 0, w, h)
    const back = ctx.createLinearGradient(0, backY, 0, baseY)
    back.addColorStop(0, '#765137')
    back.addColorStop(0.22, '#ad815a')
    back.addColorStop(0.69, '#b8875a')
    back.addColorStop(1, '#8b5f3e')
    ctx.fillStyle = back
    ctx.fillRect(backL, backY, backR - backL, baseY - backY + 2)

    const glow = ctx.createRadialGradient(vanishingX, backY + (baseY - backY) * 0.37, 0, vanishingX, backY, (backR - backL) * 0.61)
    glow.addColorStop(0, '#ffdb9c54')
    glow.addColorStop(1, '#4a291904')
    ctx.fillStyle = glow
    ctx.fillRect(backL, backY, backR - backL, baseY - backY)

    ctx.save()
    ctx.beginPath()
    ctx.rect(backL, backY, backR - backL, baseY - backY)
    ctx.clip()
    const panels = Math.max(5, Math.round((backR - backL) / 140))
    const panel = (backR - backL) / panels
    for (let i = 0; i < panels; i++) {
      const x = backL + i * panel
      ctx.fillStyle = i % 3 === 1 ? '#4a2b1814' : '#f2c28a0e'
      ctx.fillRect(x, backY, panel, baseY - backY)
      if (i > 0) {
        line(ctx, x, backY, x, baseY, '#4d322352', 2.1)
        line(ctx, x + 2.3, backY, x + 2.3, baseY, '#ffdfa04a')
      }
      for (let j = 0; j < 52; j++) {
        const startX = x + random() * panel
        const y = backY + random() * (baseY - backY)
        const length = 12 + random() * (baseY - backY) * 0.82
        const turn = (random() - 0.5) * 13
        ctx.beginPath()
        ctx.moveTo(startX, y)
        ctx.bezierCurveTo(startX + turn, y + length * 0.38, startX - turn * 0.5, y + length * 0.73, startX, y + length)
        ctx.strokeStyle = j % 3 ? '#4a2c191c' : '#ffe4ac35'
        ctx.lineWidth = 0.4 + random() * 0.75
        ctx.stroke()
      }
      const knotX = x + panel * (0.25 + random() * 0.5)
      const knotY = backY + (baseY - backY) * (0.25 + random() * 0.62)
      for (let j = 1; j < 5; j++) {
        ctx.beginPath()
        ctx.ellipse(knotX, knotY, j * 1.9, j * 6.1, -0.13, 0, Math.PI * 2)
        ctx.strokeStyle = '#4b2d1a34'
        ctx.lineWidth = 0.75
        ctx.stroke()
      }
    }
    ctx.restore()

    const surfaces = [
      { color: '#483123', points: [{ x: left, y: ceiling }, { x: backL, y: backY }, { x: backL, y: baseY }, { x: left, y: floor }] },
      { color: '#69442f', points: [{ x: right, y: ceiling }, { x: backR, y: backY }, { x: backR, y: baseY }, { x: right, y: floor }] },
      { color: '#443024', points: [{ x: left, y: ceiling }, { x: right, y: ceiling }, { x: backR, y: backY }, { x: backL, y: backY }] },
    ]
    for (const face of surfaces) {
      shape(ctx, face.points)
      ctx.fillStyle = face.color
      ctx.fill()
      ctx.save()
      ctx.clip()
      for (let i = 0; i < 110; i++) {
        const y = ceiling + random() * h * 0.69
        const x = i % 2 ? left + random() * recess : backR + random() * recess
        line(ctx, x, y, x + 1, y + 15 + random() * 90, '#f3c98313', 0.85)
      }
      for (let i = 0; i < 22; i++) {
        const y = ceiling + random() * recess * 0.58
        line(ctx, left, y, right, y + (random() - 0.5) * 5, '#f3c9831c', 0.7)
      }
      ctx.restore()
    }

    const floorPath = [{ x: backL, y: baseY }, { x: backR, y: baseY }, { x: right, y: floor }, { x: left, y: floor }]
    shape(ctx, floorPath)
    const floorPaint = ctx.createLinearGradient(0, baseY, 0, floor)
    floorPaint.addColorStop(0, '#583923')
    floorPaint.addColorStop(0.2, '#9e6a40')
    floorPaint.addColorStop(0.77, '#b78555')
    floorPaint.addColorStop(1, '#97623c')
    ctx.fillStyle = floorPaint
    ctx.fill()
    ctx.save()
    ctx.clip()
    for (let i = 1; i < panels * 2; i++) {
      const t = i / (panels * 2)
      line(ctx, backL + (backR - backL) * t, baseY, left + (right - left) * t, floor, '#5937237d', 1.2)
      line(ctx, backL + (backR - backL) * t + 1.5, baseY, left + (right - left) * t + 2, floor, '#efc78a48')
    }
    for (let i = 0; i < 420; i++) {
      const x = left + random() * (right - left)
      const y = baseY + random() * (floor - baseY)
      line(ctx, x, y, x + (x - vanishingX) * 0.035, y + 2 + random() * 21, i % 2 ? '#422a191d' : '#ffe3ac24', 0.65)
    }
    ctx.restore()

    ctx.fillStyle = '#3b261b'
    ctx.fillRect(left - lip, ceiling - lip, right - left + lip * 2, lip)
    ctx.fillRect(left - lip, ceiling, lip, floor - ceiling)
    ctx.fillRect(right, ceiling, lip, floor - ceiling)
    ctx.fillStyle = '#5c3d2b'
    ctx.fillRect(left - lip, floor, right - left + 2 * lip, lip * 2.25)
    line(ctx, left - lip, ceiling - lip, right + lip, ceiling - lip, '#9e6b47', 2)
    line(ctx, left - lip, floor, right + lip, floor, '#daa16b', 2)
    line(ctx, left - lip, floor + lip * 2.25, right + lip, floor + lip * 2.25, '#1d1713', 3)
    line(ctx, left, ceiling, left, floor, '#8f603e')
    line(ctx, right, ceiling, right, floor, '#c68e5d')
    line(ctx, backL, baseY, backR, baseY, '#e8b07962', 1.2)

    for (const x of [left - lip * 0.52, right + lip * 0.52]) {
      for (const y of [ceiling + lip, floor - lip, floor + lip]) {
        ellipse(ctx, x, y, 3.5, 3.5, '#21201a')
        ellipse(ctx, x, y - 0.5, 2.7, 2.7, '#aa8356')
        line(ctx, x - 1.3, y + 0.5, x + 1.3, y - 1.3, '#4e3b25')
      }
    }

    for (let i = 0; i < 900; i++) {
      const x = random() * w
      const y = random() * h
      ctx.fillStyle = i % 3 ? '#2b1a121e' : '#f1d0a023'
      ctx.fillRect(x, y, random() * 1.8 + 0.25, 0.7)
    }
  }

  private sprite(limb: Limb) {
    const { width: w, height: h, radius, surface } = limb
    const key = surface + ':' + w + ':' + h
    const found = this.limbs.get(key)
    if (found) return found
    const { ctx, canvas } = buffer((w + 16) * 2, (h + 16) * 2)
    ctx.scale(2, 2)
    ctx.translate(8 + w / 2, 8 + h / 2)
    const left = -w / 2
    const top = -h / 2
    const cloth = ctx.createLinearGradient(left, top, w / 2, h / 2)
    const palette: Record<Surface, [string, string, string]> = {
      head: ['#e8bc78', '#c79754', '#775032'],
      denim: ['#748379', '#55665e', '#344640'],
      pelvis: ['#8c8b68', '#656e55', '#394237'],
      hand: ['#dfb274', '#bb8c50', '#715033'],
      boot: ['#bc925c', '#936640', '#543721'],
      burlap: ['#ddae72', '#b98b52', '#735136'],
    }
    const [light, middle, dark] = palette[surface]
    cloth.addColorStop(0, light)
    cloth.addColorStop(0.55, middle)
    cloth.addColorStop(1, dark)
    path(ctx, left, top, w, h, radius)
    ctx.fillStyle = cloth
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = ctx.createPattern(this.weave, 'repeat') ?? 'transparent'
    ctx.fillRect(left, top, w, h)
    ctx.restore()
    ctx.strokeStyle = '#513521'
    ctx.lineWidth = 2
    ctx.stroke()

    path(ctx, left + 5, top + 5, w - 10, h - 10, Math.max(6, radius - 5))
    ctx.setLineDash([2.3, 3.1])
    ctx.lineWidth = 1.2
    ctx.strokeStyle = surface === 'denim' ? '#e1ca9e' : '#705235fe'
    ctx.stroke()
    ctx.setLineDash([])

    if (surface === 'denim') {
      path(ctx, -23, -22, 46, 41, 6)
      ctx.fillStyle = '#354e4a'
      ctx.fill()
      ctx.strokeStyle = '#aaaf87'
      ctx.setLineDash([2, 2])
      ctx.stroke()
      ctx.setLineDash([])
      star(ctx, 0, -1.5, 13, -Math.PI / 2, '#e7b966')
      for (let i = 0; i < 5; i++) {
        const x = -14 + i * 7
        line(ctx, x, 31, x + 4, 35, '#cbb785')
        line(ctx, x + 4, 31, x, 35, '#cbb785')
      }
    }
    if (surface === 'hand' || surface === 'boot' || surface === 'pelvis') {
      const y = surface === 'boot' ? -14 : surface === 'hand' ? -13 : 5
      for (let i = 0; i < 3; i++) {
        line(ctx, left + 5, y + i * 3, w / 2 - 5, y + i * 3 - 2, '#684b32', 2.2)
        line(ctx, left + 5, y + i * 3 - 1, w / 2 - 5, y + i * 3 - 3, '#dfba7e', 1)
      }
    }
    this.limbs.set(key, canvas)
    return canvas
  }

  draw(room: Room, limbs: Limb[], head: Limb | null, game: GameDirector, drag: Drag | null, suspended: boolean, reduceMotion: boolean, gadgets: GadgetSystem) {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.backdrop.canvas, 0, 0)
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    const shake = game.shake
    if (!reduceMotion && shake.until > game.now) {
      const power = shake.strength * ((shake.until - game.now) / 230) * Math.cos(game.now / 13)
      ctx.translate(shake.x * power + shake.y * power * 0.25, shake.y * power + shake.x * power * 0.25)
      ctx.drawImage(this.backdrop.canvas, 0, 0, room.width, room.height)
    }

    this.gadgetArt.backdrop(ctx, room, gadgets)
    if (head) {
      const low = limbs.reduce((lowest, limb) => Math.max(lowest, limb.body.bounds.max.y), 0)
      const center = limbs.reduce((sum, limb) => sum + limb.body.position.x, 0) / limbs.length
      const contact = clamp(1 - (room.floor - low) / 240, 0.2, 1)
      ctx.globalAlpha = contact * 0.8
      ctx.drawImage(this.shadow, center - 109, room.floor - 24, 218, 43)
      ctx.globalAlpha = 1
      if (suspended) {
        const { x, y } = head.body.position
        line(ctx, room.width / 2, room.ceiling, x, y - 47, '#513927ba', 2.6)
        line(ctx, room.width / 2 - 0.8, room.ceiling, x - 0.8, y - 47, '#d9ad73a6', 0.8)
        ellipse(ctx, room.width / 2, room.ceiling + 1, 5, 2.5, '#c99e63')
      }
    }

    if (drag) {
      ctx.save()
      ctx.setLineDash([4, 4])
      line(ctx, drag.from.x, drag.from.y, drag.to.x, drag.to.y, '#ffdfa4cc', 2)
      ctx.restore()
      ellipse(ctx, drag.from.x, drag.from.y, 4, 4, '#ffe4ab')
    }

    if (head) {
      const neck = { x: head.body.position.x - Math.sin(head.body.angle) * 52, y: head.body.position.y + Math.cos(head.body.angle) * 52 }
      ctx.save()
      ctx.translate(neck.x, neck.y)
      ctx.rotate(head.body.angle)
      path(ctx, -17, -9, 34, 21, 8)
      ctx.fillStyle = '#8f5d35'
      ctx.fill()
      for (let i = 0; i < 5; i++) line(ctx, -15, -6 + i * 4, 15, -8 + i * 4, '#d5ab6c', 2)
      ctx.restore()
    }

    this.gadgetArt.objects(ctx, gadgets, limbs.find(limb => limb.surface === 'denim'))
    for (const limb of limbs) this.drawLimb(limb, game)
    this.gadgetArt.overlays(ctx, gadgets, room)
    for (const p of game.particles) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.globalAlpha = p.kind === 'coin' ? 1 : Math.min(1, (1 - p.age / p.life) * 2.4)
      if (p.kind === 'coin') {
        const width = p.size * (0.2 + Math.abs(Math.cos(p.spin + p.age / 61)) * 0.8)
        ellipse(ctx, 1, 1, width + 1, p.size + 1, '#74421e')
        ellipse(ctx, 0, 0, width, p.size, '#f6c95e')
        ellipse(ctx, 0, 0, Math.max(0.8, width * 0.52), p.size * 0.64, '#cf8d2e')
        line(ctx, 0, -p.size * 0.45, 0, p.size * 0.47, '#fff0a5', 1.2)
      } else if (p.kind === 'heart') {
        ctx.scale(p.size / 7, p.size / 7)
        ctx.beginPath()
        ctx.moveTo(0, 5)
        ctx.bezierCurveTo(-17, -5, -5, -13, 0, -6)
        ctx.bezierCurveTo(5, -13, 17, -5, 0, 5)
        ctx.fillStyle = '#eda58a'
        ctx.fill()
      } else if (p.kind === 'cotton') {
        ellipse(ctx, 0, 0, p.size, p.size * 0.8, '#f1e6cf')
        ellipse(ctx, -p.size * 0.47, -2, p.size * 0.46, p.size * 0.54, '#fff7e4')
        ellipse(ctx, p.size * 0.38, p.size * 0.3, p.size * 0.48, p.size * 0.57, '#e7d8bf')
      } else if (p.kind === 'spark') {
        star(ctx, 0, 0, p.size, p.spin + p.age / 98, '#ffdea0')
      } else {
        ctx.rotate(p.spin + p.age / 82)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -2, p.size, 4)
      }
      ctx.restore()
    }

    for (const callout of game.callouts) {
      ctx.save()
      ctx.translate(clamp(callout.x, room.left + 88, room.right - 88), clamp(callout.y - callout.age * 0.046, room.ceiling + 22, room.floor - 16))
      ctx.rotate(callout.accent ? 0.055 : -0.12)
      ctx.globalAlpha = Math.min(1, (1 - callout.age / 880) * 3)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.font = callout.accent ? '800 22px system-ui' : 'italic 950 37px system-ui'
      ctx.strokeStyle = '#352217'
      ctx.lineWidth = callout.accent ? 4 : 5.5
      ctx.strokeText(callout.text, 0, 0)
      ctx.fillStyle = callout.accent ? '#ffcd62' : '#ffedbf'
      ctx.fillText(callout.text, 0, 0)
      ctx.restore()
    }
    if (head && game.speech) this.speech(room, head, game.speech.text, game.speech.until - game.now)
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    this.gadgetArt.reticle(ctx, gadgets)
  }

  private drawLimb(limb: Limb, game: GameDirector) {
    const ctx = this.ctx
    const { body, width: w, height: h } = limb
    ctx.save()
    ctx.translate(body.position.x, body.position.y)
    ctx.rotate(body.angle)
    const fabric = this.sprite(limb)
    ctx.drawImage(fabric, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16)
    if (limb.surface === 'head') this.face(game)
    for (const mark of limb.marks) {
      ctx.save()
      ctx.translate(mark.x, mark.y)
      ctx.rotate(mark.angle)
      if (mark.bandage) {
        path(ctx, -15, -5, 30, 10, 4)
        ctx.fillStyle = '#dfb28a'
        ctx.fill()
        ctx.strokeStyle = '#81583b'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = '#f6d2a6'
        ctx.fillRect(-5, -4, 10, 8)
        for (const x of [-11, -8, 8, 11]) ellipse(ctx, x, 0, 0.75, 0.75, '#a07556')
      } else {
        ctx.drawImage(this.smudge, -21, -21, 42, 42)
      }
      ctx.restore()
    }
    if (limb.decals.length) {
      ctx.save()
      path(ctx, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, limb.radius)
      ctx.clip()
      for (const decal of limb.decals) this.gadgetArt.decal(ctx, decal, game.now)
      ctx.restore()
    }
    ctx.restore()
  }

  private face(game: GameDirector) {
    const ctx = this.ctx
    const mode = game.expression?.kind
    if (this.photo) ctx.drawImage(this.photo, -39, -39, 78, 78)
    else {
      for (const x of [-24, 23]) {
        const y = x < 0 ? -8 : -5
        ellipse(ctx, x + 1, y + 1, 10.5, 10.5, '#664526')
        ellipse(ctx, x, y, 9.5, 9.5, '#362c24')
        ellipse(ctx, x - 2, y - 2, 6.5, 6.2, '#4b3e31')
        line(ctx, x - 3, y - 3, x + 3, y + 3, '#d8b58a', 1.6)
        line(ctx, x + 3, y - 3, x - 3, y + 3, '#d8b58a', 1.6)
      }
      ctx.beginPath()
      ctx.moveTo(-17, 14)
      ctx.quadraticCurveTo(0, game.hud.mood === 'Happy' ? 34 : 27, 19, 12)
      ctx.lineWidth = 2.2
      ctx.strokeStyle = '#4c3424'
      ctx.stroke()
      for (const [x, y] of [[-14, 16], [-8, 20], [0, 21], [8, 19], [15, 15]] as const) {
        line(ctx, x - 1, y - 2.5, x + 1, y + 2.5, '#63412a')
      }
      ellipse(ctx, -34, 10, 6, 2.5, '#d082555c')
      ellipse(ctx, 33, 9, 6, 2.5, '#d082555c')
    }

    if (mode === 'stars') {
      for (const x of [-24, 23]) star(ctx, x, -6, 13, game.now / 90 + x, '#ffd060')
      star(ctx, -37, -39, 7, -game.now / 120, '#ffee9c')
      star(ctx, 31, -43, 8, game.now / 120, '#ffee9c')
    } else if (mode === 'spirals') {
      for (const x of [-24, 23]) {
        ellipse(ctx, x, -6, 12, 12, '#eedab0')
        ctx.beginPath()
        for (let i = 0; i < 29; i++) {
          const a = i * 0.45 + game.now / 65
          const r = i * 0.33
          const px = x + Math.cos(a) * r
          const py = -6 + Math.sin(a) * r
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.lineWidth = 1.65
        ctx.strokeStyle = '#4f3829'
        ctx.stroke()
      }
    } else if (mode === 'shock') {
      for (const x of [-23, 22]) {
        ellipse(ctx, x, -5, 12, 10, '#fff0c8')
        ellipse(ctx, x + 2, -4, 4, 5, '#352b26')
      }
      ellipse(ctx, 2, 20, 7, 8, '#4e2922')
    } else if (mode === 'sweat') {
      ctx.beginPath()
      ctx.moveTo(42, -23)
      ctx.quadraticCurveTo(53, -8, 43, -6)
      ctx.quadraticCurveTo(35, -9, 42, -23)
      ctx.fillStyle = '#badee0'
      ctx.fill()
    }
  }

  private speech(room: Room, limb: Limb, message: string, remaining: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.font = '750 20px system-ui'
    const words = message.split(/\s+/)
    const lines: string[] = []
    let row = ''
    for (const word of words) {
      const safeWord = ctx.measureText(word).width > 235 ? word.slice(0, 18) + '…' : word
      if (row && ctx.measureText(row + ' ' + safeWord).width > 240) {
        lines.push(row)
        row = safeWord
      } else row += (row ? ' ' : '') + safeWord
    }
    if (row) lines.push(row)
    const visible = lines.slice(0, 3)
    if (lines.length > 3) visible[2] = (visible[2] ?? '').slice(0, 18) + '…'
    const w = Math.max(...visible.map(text => ctx.measureText(text).width), 38) + 32
    const h = 22 + visible.length * 24
    const { x: anchorX, y: anchorY } = limb.body.position
    const x = clamp(anchorX - w / 2, room.left + 8, room.right - w - 8)
    const above = anchorY - h - 62 > room.ceiling
    const y = above ? Math.min(room.floor - h - 16, anchorY - h - 62) : Math.min(room.floor - h - 10, anchorY + 57)
    const tip = clamp(anchorX, x + 16, x + w - 16)
    const edge = y + (above ? h - 2 : 2)
    ctx.globalAlpha = Math.min(1, remaining / 210)
    path(ctx, x, y, w, h, 9)
    ctx.fillStyle = '#30231888'
    ctx.save()
    ctx.translate(2, 4)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#fae8c7'
    ctx.strokeStyle = '#4a3324'
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()
    shape(ctx, [{ x: tip - 7, y: edge }, { x: tip + 8, y: edge }, { x: tip - 3, y: edge + (above ? 13 : -13) }])
    ctx.fill()
    ctx.stroke()
    line(ctx, tip - 6, edge, tip + 7, edge, '#fae8c7', 2)
    ctx.fillStyle = '#36261e'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    visible.forEach((text, i) => ctx.fillText(text, x + w / 2, y + 22 + i * 24))
    ctx.restore()
  }
}
