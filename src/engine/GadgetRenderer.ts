import { clamp } from './model'
import type { Limb, Room } from './model'
import type { Decal, Mount } from './gadgetModel'
import type { GadgetSystem } from './GadgetSystem'
import { ellipse, line, path, shape } from './canvasDraw'
import type { Pen } from './canvasDraw'

const TAU = Math.PI * 2

function polygon(ctx: Pen, points: Array<[number, number]>, fill: string, stroke?: string) {
  shape(ctx, points.map(([x, y]) => ({ x, y })))
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.lineWidth = 1.8
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
}

function disc(ctx: Pen, x: number, y: number, radius: number, color: string) {
  ellipse(ctx, x, y, radius, radius, color)
}

function ring(ctx: Pen, x: number, y: number, radius: number, color: string, width: number) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function rotateMount(ctx: Pen, mount: Mount) {
  ctx.translate(mount.point.x, mount.point.y)
  ctx.rotate(Math.atan2(mount.normal.y, mount.normal.x) + Math.PI / 2)
}

function padArt(ctx: Pen, mount: Mount, compression: number, opacity = 1) {
  ctx.save()
  ctx.globalAlpha *= opacity
  rotateMount(ctx, mount)
  const spring = 14 - compression * 8
  for (const x of [-39, 39]) {
    line(ctx, x, -1, x + 5, -spring + 1, '#33261e', 6)
    line(ctx, x - 2, -2, x + 3, -spring, '#d59b56', 1.4)
  }
  path(ctx, -51, -spring - 11, 102, 14, 5)
  ctx.fillStyle = '#554135'
  ctx.fill()
  ctx.strokeStyle = '#291e16'
  ctx.lineWidth = 2
  ctx.stroke()
  path(ctx, -45, -spring - 9, 90, 6, 3)
  ctx.fillStyle = '#d6aa69'
  ctx.fill()
  line(ctx, -30, -spring - 6, 30, -spring - 6, '#685f4a', 2)
  ctx.restore()
}

function turretArt(ctx: Pen, mount: Mount, angle: number, life: number, ghost = false) {
  ctx.save()
  if (ghost) ctx.globalAlpha *= 0.56
  ctx.save()
  rotateMount(ctx, mount)
  path(ctx, -19, -7, 38, 10, 3)
  ctx.fillStyle = '#49392d'
  ctx.fill()
  line(ctx, -15, -5, 15, -5, '#c69c66', 1.8)
  ctx.restore()
  ctx.translate(mount.point.x, mount.point.y)
  ctx.rotate(angle)
  disc(ctx, 10, 0, 11, '#272827')
  disc(ctx, 10, 0, 7.7, '#716651')
  path(ctx, 9, -5, 23, 10, 2)
  ctx.fillStyle = '#373a38'
  ctx.fill()
  line(ctx, 13, -3, 29, -3, '#a89876', 1.3)
  path(ctx, 28, -7, 7, 14, 2)
  ctx.fillStyle = '#826747'
  ctx.fill()
  disc(ctx, 25, 5, 2, '#ef775c')
  if (!ghost) {
    line(ctx, 2, 15, 29, 15, '#412f23', 2)
    line(ctx, 2, 15, 2 + 27 * life, 15, '#c6c297', 2)
  }
  ctx.restore()
}

function plungerArt(ctx: Pen, kind: 'plunger' | 'dart', wobble: number) {
  // The base remains welded to the local contact point while the stem flexes.
  ctx.save()
  ctx.rotate(wobble * 0.64)
  const full = kind === 'plunger'
  const length = full ? 35 : 24
  polygon(ctx, [[-3, -5], [5, full ? -11 : -7], [13, -5], [13, 5], [5, full ? 11 : 7], [-3, 5]], full ? '#b6543d' : '#e58063', '#633526')
  line(ctx, 3, -6, 3, 6, '#ec9072', 2)
  ctx.rotate(wobble * 0.36)
  line(ctx, 11, 0, length, 0, '#433123', 5)
  line(ctx, 11, -1, length, -1, '#d8a266', 2.5)
  if (!full) polygon(ctx, [[18, -2], [29, -7], [28, 7], [18, 2]], '#c5a175', '#6e4e34')
  ctx.restore()
}

export class GadgetRenderer {
  private stamps = new Map<string, HTMLCanvasElement>()

  decal(ctx: Pen, decal: Decal, now: number) {
    const { x, y, color, kind, size, seed, born } = decal
    const key = kind + color + seed
    let stamp = this.stamps.get(key)
    if (!stamp) {
      stamp = document.createElement('canvas')
      stamp.width = stamp.height = 64
      const pen = stamp.getContext('2d')
      if (!pen) return
      pen.translate(32, 32)
      pen.rotate(seed * 0.48)
      pen.globalAlpha = 0.88
      if (kind === 'egg') {
        ellipse(pen, 0, 1, 19, 14, '#fff1ca')
        ellipse(pen, 10, -7, 12, 8, '#fff7d7')
        ellipse(pen, -11, 2, 12, 9, '#fff3cf')
      }
      const spokes: Array<[number, number]> = []
      for (let i = 0; i < 24; i++) {
        const angle = i / 24 * TAU
        const r = i % 2 === 0 ? 10 + 10 * (0.5 + Math.sin(i * 7 + seed) * 0.5) : 8
        spokes.push([Math.cos(angle) * r, Math.sin(angle) * r])
      }
      polygon(pen, spokes, color)
      for (let i = 0; i < 9; i++) {
        const angle = i / 9 * TAU
        const d = 17 + (i * 17 % 11)
        disc(pen, Math.cos(angle) * d, Math.sin(angle) * d, 1.2 + i % 3, color)
      }
      ellipse(pen, -3, -3, 6, 2.4, kind === 'egg' ? '#fff3af' : '#ffffff55')
      if (this.stamps.size >= 32) {
        const oldest = this.stamps.keys().next()
        if (!oldest.done) this.stamps.delete(oldest.value)
      }
      this.stamps.set(key, stamp)
    }
    ctx.drawImage(stamp, x - size * 1.55, y - size * 1.55, size * 3.1, size * 3.1)
    if (kind === 'foam') return
    const drip = clamp((now - born) / 1250, 0, 1) * (size * 0.9 + seed * 2)
    line(ctx, x + 3, y + size * 0.4, x + 4, y + size * 0.4 + drip, color, 2.7)
    disc(ctx, x + 4, y + size * 0.4 + drip, 2.2, color)
  }

  backdrop(ctx: Pen, room: Room, gadgets: GadgetSystem) {
    if (gadgets.wallDecals.length) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(room.left, room.ceiling, room.right - room.left, room.floor - room.ceiling)
      ctx.clip()
      for (const decal of gadgets.wallDecals) this.decal(ctx, decal, gadgets.now)
      ctx.restore()
    }
    for (const { mount, pulseUntil } of gadgets.pads) padArt(ctx, mount, clamp((pulseUntil - gadgets.now) / 205, 0, 1))
    for (const { body, pulseUntil } of gadgets.bumpers) {
      const { x, y } = body.position
      const power = clamp((pulseUntil - gadgets.now) / 205, 0, 1)
      const size = 23 + power * 7
      ring(ctx, x, y, size + 4 + power * 7, power ? '#ffdda58c' : '#d8a26661', 2)
      disc(ctx, x + 1, y + 2, size, '#3f2924')
      disc(ctx, x, y, size - 2, power ? '#f3bb70' : '#a95b47')
      ring(ctx, x, y, size - 6, '#f6c37d', 2)
      disc(ctx, x, y, size * 0.44, power ? '#ffe8ae' : '#deb279')
      line(ctx, x - 4, y + 3, x + 4, y - 3, '#786041', 2)
    }
  }

  objects(ctx: Pen, gadgets: GadgetSystem, torso: Limb | undefined) {
    const { now } = gadgets
    for (const turret of gadgets.turrets) {
      const { x, y } = turret.mount.point
      const target = gadgets.ice?.body.position ?? torso?.body.position
      if (target) {
        const direction = { x: Math.cos(turret.angle), y: Math.sin(turret.angle) }
        const distance = Math.hypot(target.x - x, target.y - y)
        line(ctx, x + 34 * direction.x, y + 34 * direction.y, x + distance * direction.x, y + distance * direction.y, '#ff705b88', 1.3)
      }
      turretArt(ctx, turret.mount, turret.angle, 1 - (now - turret.born) / 15000)
    }
    for (const body of gadgets.anvils) {
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      polygon(ctx, [[-44, -21], [42, -21], [34, -11], [17, -5], [17, 8], [32, 16], [32, 24], [-33, 24], [-33, 16], [-18, 9], [-18, -5], [-33, -10]], '#424747', '#24241f')
      polygon(ctx, [[-42, -21], [40, -21], [33, -15], [-36, -15]], '#868778')
      polygon(ctx, [[17, -5], [17, 8], [32, 16], [26, 20], [9, 11], [7, -4]], '#292e30')
      line(ctx, -26, 20, 24, 20, '#727568', 1.8)
      disc(ctx, -8, -4, 2, '#969587')
      disc(ctx, 1, -4, 2, '#969587')
      ctx.restore()
    }
    for (const shot of gadgets.shots) {
      const { position } = shot.body
      const angle = Math.atan2(shot.body.velocity.y, shot.body.velocity.x)
      ctx.save()
      ctx.translate(position.x, position.y)
      ctx.rotate(angle)
      if (shot.kind === 'plunger' || shot.kind === 'dart') {
        ctx.rotate(Math.PI)
        ctx.scale(0.76, 0.76)
        plungerArt(ctx, shot.kind, 0)
      } else {
        line(ctx, -shot.radius * 3.1, 0, -3, 0, shot.color + '8f', shot.radius * 0.5)
        ellipse(ctx, 0, 0, shot.radius * 1.15, shot.radius * 0.82, shot.kind === 'egg' ? '#fff0cb' : shot.color)
        ellipse(ctx, 1.6, -2, shot.radius * 0.43, 1.7, '#fff6dba6')
      }
      ctx.restore()
    }
  }

  overlays(ctx: Pen, gadgets: GadgetSystem, room: Room) {
    const { now, cursor, ice, glove, shock } = gadgets
    for (const attachment of gadgets.attachments) {
      const { limb, offset, angle, kind, wobble } = attachment
      ctx.save()
      ctx.translate(limb.body.position.x, limb.body.position.y)
      ctx.rotate(limb.body.angle)
      ctx.translate(offset.x, offset.y)
      ctx.rotate(angle)
      plungerArt(ctx, kind, wobble)
      ctx.restore()
    }
    if (ice) {
      const { width, height, body } = ice
      const inset = 9
      ctx.save()
      ctx.translate(body.position.x, body.position.y)
      ctx.rotate(body.angle)
      path(ctx, -width / 2, -height / 2, width, height, 10)
      ctx.fillStyle = '#a5d9dc5e'
      ctx.strokeStyle = '#c8eeeb'
      ctx.lineWidth = 2.6
      ctx.fill()
      ctx.stroke()
      path(ctx, -width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, 7)
      ctx.strokeStyle = '#e3fff4a1'
      ctx.lineWidth = 1.2
      ctx.stroke()
      polygon(ctx, [[-width / 2 + 9, -height / 2 + 9], [width / 2 - 8, -height / 2 + 9], [-width / 2 + 9, -height / 2 + Math.min(72, height / 2)]], '#f5ffff52')
      line(ctx, width / 2 - 13, -height / 2 + 35, width / 2 - 13, height / 2 - 22, '#ecfffb85', 1.4)
      line(ctx, -width / 2 + 15, height / 2 - 26, -width / 2 + 36, height / 2 - 38, '#e3fff4ad', 1.8)
      ctx.restore()
    }
    for (const shard of gadgets.shards) {
      const { x, y, size, angle, age } = shard
      ctx.save()
      ctx.globalAlpha = clamp((1050 - age) / 250, 0, 1)
      ctx.translate(x, y)
      ctx.rotate(angle)
      polygon(ctx, [[0, -size], [size * 0.73, 2], [0, size * 0.75], [-size * 0.42, 0]], '#a2d9e4', '#c1e8e9')
      polygon(ctx, [[0, -size], [size * 0.73, 2], [0, 2]], '#edfefd')
      polygon(ctx, [[0, 2], [size * 0.73, 2], [0, size * 0.75]], '#659cae')
      ctx.restore()
    }
    if (glove) {
      const { from, point, angle } = glove
      const length = Math.hypot(point.x - from.x, point.y - from.y)
      ctx.save()
      ctx.translate(point.x, point.y)
      ctx.rotate(angle)
      for (let i = 0; i < Math.min(31, Math.floor(length / 13)); i++) {
        const x = -26 - i * 13
        line(ctx, x, i % 2 ? -8 : 8, x - 13, i % 2 ? 8 : -8, '#3f3027', 4)
        line(ctx, x, i % 2 ? -9 : 7, x - 13, i % 2 ? 7 : -9, '#ba9c79', 1.8)
      }
      path(ctx, -37, -15, 25, 29, 6)
      ctx.fillStyle = '#954333'
      ctx.fill()
      path(ctx, -22, -25, 52, 47, 19)
      ctx.fillStyle = '#d9513d'
      ctx.strokeStyle = '#6d3028'
      ctx.lineWidth = 3
      ctx.fill()
      ctx.stroke()
      ellipse(ctx, -7, 13, 14, 12, '#ae3e31')
      line(ctx, -7, -14, 16, -13, '#f6a280', 2.6)
      line(ctx, 4, 13, 17, 11, '#9a362c', 2)
      ctx.restore()
    }
    if (shock) {
      const age = (now - shock.time) / 420
      ctx.save()
      ctx.globalAlpha = 1 - age
      ring(ctx, shock.point.x, shock.point.y, 25 + age * 310, '#f0d4a7', 4)
      ring(ctx, shock.point.x, shock.point.y, 17 + age * 255, '#ad8b83', 2)
      ctx.restore()
    }
    if (gadgets.held && cursor && gadgets.tool === 'vortex') {
      ctx.save()
      ctx.translate(cursor.x, cursor.y)
      ctx.rotate(-0.25)
      ctx.scale(1, 0.66)
      disc(ctx, 0, 0, 37, '#31252c')
      ring(ctx, 0, 0, 43, '#c296c4a6', 4)
      ring(ctx, 0, 0, 62, '#e7b78880', 1.5)
      disc(ctx, 0, 0, 29, '#17151b')
      for (let i = 0; i < 28; i++) {
        const radius = 39 + i % 8 * 7.2
        const a = i * 2.4 + now / (54 + i % 5 * 16)
        const color = i % 3 ? '#f3b67f' : '#d0a5d9'
        disc(ctx, Math.cos(a) * radius, Math.sin(a) * radius, 1.2 + i % 3 * 0.6, color)
      }
      ctx.restore()
    } else if (gadgets.held && cursor && gadgets.tool === 'freeze') {
      const start = { x: cursor.x > room.width / 2 ? room.left + 7 : room.right - 7, y: clamp(cursor.y + 79, room.ceiling, room.floor) }
      line(ctx, start.x, start.y, cursor.x, cursor.y, '#8bd1e3a8', 10)
      line(ctx, start.x, start.y, cursor.x, cursor.y, '#e2fbefb8', 2.8)
      for (let i = 0; i < 14; i++) {
        const t = (i / 14 + now / 285) % 1
        const x = start.x + (cursor.x - start.x) * t
        const y = start.y + (cursor.y - start.y) * t + Math.sin(t * 83 + i) * 8
        disc(ctx, x, y, 2 + i % 2, '#d2f3f0')
      }
    }
  }

  reticle(ctx: Pen, gadgets: GadgetSystem) {
    const { cursor, tool } = gadgets
    if (!cursor || tool === 'grab') return
    const { x, y } = cursor
    if (tool === 'trampoline' || tool === 'turret') {
      const mount = gadgets.placement(cursor, tool === 'turret')
      ctx.save()
      ctx.setLineDash([3, 5])
      line(ctx, x, y, mount.point.x, mount.point.y, '#f4deaaae', 1.4)
      ctx.restore()
      if (tool === 'trampoline') padArt(ctx, mount, 0, 0.58)
      else turretArt(ctx, mount, Math.atan2(mount.normal.y, mount.normal.x), 0, true)
    }
    const color = tool === 'freeze' ? '#d0f4f2' : '#ffe0a4'
    const radius = tool === 'vortex' ? 23 : 12
    ring(ctx, x, y, radius, '#34261b', 3.4)
    ring(ctx, x, y, radius, color, 1.5)
    if (tool === 'vortex') {
      ring(ctx, x, y, radius + 6, '#f5d3a998', 1)
    } else {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2
        line(ctx, x + Math.cos(a) * 7, y + Math.sin(a) * 7, x + Math.cos(a) * 17, y + Math.sin(a) * 17, color, 1.5)
      }
    }
    disc(ctx, x, y, 1.7, color)
  }
}
