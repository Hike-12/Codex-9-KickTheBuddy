import Matter from 'matter-js'
import type { Body as RigidBody, Engine as MatterEngine, Pair, Vector } from 'matter-js'
import { DOLL_LAYER, FIXTURE_LAYER, MOVING_LAYERS, PROP_LAYER, ROOM_LAYER, STEP } from './gadgetModel'
import type { Ammo, Attachment, Bumper, Decal, Glove, GravityMode, Ice, Mount, Pad, Shard, Shot, Tool, Turret } from './gadgetModel'
import type { GameDirector } from './GameDirector'
import { clamp, localPoint } from './model'
import type { Limb, Room } from './model'
import { containBody, finiteBody } from './roomBounds'

const { Bodies, Body, Composite, Vector: Vec } = Matter
const ICE_HIT = 17
const BUMPER_RADIUS = 23
const PAD_WIDTH = 102
const SOLID_MASK = ROOM_LAYER | PROP_LAYER | DOLL_LAYER | FIXTURE_LAYER
const GRAVITY = { normal: 1, moon: 0.22, zero: 0 } satisfies Record<GravityMode, number>
const COLORS = ['#f650a0', '#39dbc9', '#b5e75c', '#bc86fa', '#53bdf1']
const AMMO = ['paint', 'egg', 'tomato'] as const
const MOUNTS = {
  floor: { x: 0, y: -1 }, ceiling: { x: 0, y: 1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 },
} satisfies Record<Mount['edge'], Vector>
type Target = { body: RigidBody; width: number; height: number; limb?: Limb }
type DollAccess = {
  limbs: () => Limb[]
  torso: () => Limb | undefined
  wake: () => void
  setSolid: (solid: boolean) => void
}

function pushVelocity(body: RigidBody, direction: Vector, speed: number, mix = 1) {
  const velocity = Body.getVelocity(body)
  Body.setVelocity(body, {
    x: clamp(velocity.x * mix + direction.x * speed, -68, 68),
    y: clamp(velocity.y * mix + direction.y * speed, -68, 68),
  })
}

function aim(from: Vector, to: Vector) {
  return Vec.normalise(Vec.sub(to, from))
}

function contact(t: Target, from: Vector, to: Vector, radius: number) {
  const a = localPoint(from, t.body)
  const b = localPoint(to, t.body)
  let enter = 0
  let exit = 1
  for (const [origin, delta, limit] of [[a.x, b.x - a.x, t.width / 2 + radius], [a.y, b.y - a.y, t.height / 2 + radius]] as const) {
    if (Math.abs(delta) < 0.0001) {
      if (Math.abs(origin) > limit) return undefined
      continue
    }
    const first = (-limit - origin) / delta
    const second = (limit - origin) / delta
    enter = Math.max(enter, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
    if (enter > exit) return undefined
  }
  return enter
}

export class GadgetSystem {
  readonly world = Composite.create({ label: 'Studio gadgets' })
  readonly shots: Shot[] = []
  readonly anvils: RigidBody[] = []
  readonly pads: Pad[] = []
  readonly turrets: Turret[] = []
  readonly bumpers: Bumper[] = []
  readonly attachments: Attachment[] = []
  readonly wallDecals: Decal[] = []
  readonly shards: Shard[] = []
  ice: Ice | null = null
  glove: Glove | null = null
  tool: Tool = 'grab'
  cursor: Vector | null = null
  held = false
  freezeProgress = 0
  quakeUntil = 0
  shock: { point: Vector; time: number } | null = null
  private room: Room = { width: 1, height: 1, left: 0, right: 1, ceiling: 0, floor: 1 }
  private gravity: GravityMode = 'normal'
  private nextShot = 0
  private nextQuake = 0
  private quakeAudible = false
  private shotIndex = 0
  private impactAt = -1000
  private clangAt = -1000
  private thawAt: Vector | null = null
  private decalIndex = 0
  private rebounds: Array<{ body: RigidBody; normal: Vector; power: number }> = []

  constructor(private engine: MatterEngine, private director: GameDirector, private doll: DollAccess) {
    Composite.add(engine.world, this.world)
  }

  get now() { return this.director.now }

  setTool(tool: Tool) {
    this.tool = tool
    this.held = false
  }

  setGravity(gravity: GravityMode) {
    this.gravity = gravity
    if (gravity !== 'normal') this.doll.wake()
  }

  quake() {
    this.quakeUntil = this.now + 2500
    this.nextQuake = this.now
    this.doll.wake()
    this.quakeAudible = true
    this.director.sound({ kind: 'loop', loop: 'quake', active: true })
  }

  silenceQuake() {
    if (!this.quakeAudible) return
    this.quakeAudible = false
    this.director.sound({ kind: 'loop', loop: 'quake', active: false })
  }

  setBumpers(enabled: boolean) {
    for (const bumper of this.bumpers) Composite.remove(this.world, bumper.body)
    this.bumpers.length = 0
    if (!enabled) return
    const { left, right, ceiling, floor } = this.room
    for (let i = 0; i < 3; i++) {
      const x = left + (right - left) * (0.22 + i * 0.28)
      const y = ceiling + (floor - ceiling) * (i === 1 ? 0.115 : 0.28)
      const body = Bodies.circle(x, y, BUMPER_RADIUS, {
        isStatic: true, label: 'Pinball bumper',
        collisionFilter: { category: FIXTURE_LAYER, mask: MOVING_LAYERS },
      })
      body.restitution = 1.45
      this.bumpers.push({ body, pulseUntil: 0 })
      Composite.add(this.world, body)
    }
  }

  resize(room: Room) {
    const old = this.room
    this.room = room
    if (old.width <= 1) return
    const project = (point: Vector) => ({
      x: room.left + (point.x - old.left) / (old.right - old.left) * (room.right - room.left),
      y: room.ceiling + (point.y - old.ceiling) / (old.floor - old.ceiling) * (room.floor - room.ceiling),
    })
    for (const shot of this.shots) Composite.remove(this.world, shot.body)
    this.shots.length = 0
    for (const body of this.anvils) {
      Body.setPosition(body, this.bounds(project(body.position), 37))
      containBody(body, room, true)
    }
    for (const decal of this.wallDecals) Object.assign(decal, this.bounds(project(decal)))
    for (const pad of this.pads) {
      pad.mount = this.mountFrom(project(pad.mount.point), pad.mount.edge)
      Body.setPosition(pad.body, Vec.add(pad.mount.point, Vec.mult(pad.mount.normal, 9)))
    }
    for (const turret of this.turrets) turret.mount = this.mountFrom(project(turret.mount.point), turret.mount.edge, true)
    if (this.bumpers.length) this.setBumpers(true)
    if (this.ice) {
      const { body, width, height } = this.ice
      const point = project(body.position)
      const radiusX = Math.min((room.right - room.left) / 2, (width / 2) * Math.abs(Math.cos(body.angle)) + (height / 2) * Math.abs(Math.sin(body.angle)))
      const radiusY = Math.min((room.floor - room.ceiling) / 2, (height / 2) * Math.abs(Math.cos(body.angle)) + (width / 2) * Math.abs(Math.sin(body.angle)))
      Body.setPosition(body, {
        x: clamp(point.x, room.left + radiusX, room.right - radiusX),
        y: clamp(point.y, room.ceiling + radiusY, room.floor - radiusY),
      })
      containBody(body, room, true)
      this.syncIce()
    }
  }

  move(point: Vector | null) {
    this.cursor = point ? this.bounds(point, 2) : null
  }

  press(point: Vector, alternate: boolean) {
    this.move(point)
    const cursor = this.cursor
    if (!cursor) return
    this.held = true
    this.nextShot = this.now
    if (this.tool === 'vortex' || this.tool === 'freeze') this.director.sound({ kind: 'loop', loop: this.tool, active: true })
    if (this.tool === 'impact') {
      if (alternate) this.punch(cursor)
      else this.dropAnvil(cursor.x)
    } else if (this.tool === 'trampoline') {
      this.addPad(this.placement(cursor, false))
    } else if (this.tool === 'turret') {
      this.addTurret(this.placement(cursor, true))
    } else if (this.tool === 'paint' || this.tool === 'suction') {
      this.fireHeld()
    }
  }

  release(detonate: boolean) {
    this.silenceQuake()
    if (this.held && (this.tool === 'vortex' || this.tool === 'freeze')) {
      this.director.sound({ kind: 'loop', loop: this.tool, active: false })
    }
    if (detonate && this.held && this.tool === 'vortex' && this.cursor) {
      const point = this.cursor
      this.shock = { point, time: this.now }
      this.doll.wake()
      for (const body of this.movingBodies()) {
        const delta = Vec.sub(body.position, point)
        const distance = Vec.magnitude(delta)
        const angle = body.id * 2.399
        const direction = distance > 1 ? Vec.mult(delta, 1 / distance) : { x: Math.cos(angle), y: Math.sin(angle) }
        pushVelocity(body, direction, clamp(68 - distance * 0.057, 26, 68), 0.24)
        Body.setAngularVelocity(body, clamp(body.angularVelocity + 0.19, -0.33, 0.33))
      }
      this.director.rattle({ x: 0.8, y: 0.6 }, 13)
      this.director.sound({ kind: 'shockwave' })
    }
    this.held = false
  }

  resetDoll() {
    if (this.ice) Composite.remove(this.world, this.ice.body)
    this.ice = null
    if (this.attachments.length) this.director.sound({ kind: 'pop' })
    this.attachments.length = 0
    this.freezeProgress = 0
    this.thawAt = null
    this.rebounds.length = 0
  }

  clear() {
    this.release(false)
    if (this.ice) this.thaw(false)
    this.resetDoll()
    Composite.clear(this.world, false)
    for (const group of [this.shots, this.anvils, this.pads, this.turrets, this.bumpers, this.wallDecals, this.shards]) group.length = 0
    for (const limb of this.doll.limbs()) {
      limb.decals.length = 0
      limb.marks.length = 0
    }
    this.glove = null
    this.shock = null
    this.quakeUntil = 0
    this.gravity = 'normal'
    this.director.hud.quake = false
    this.director.shake.until = 0
  }

  placement(point: Vector, upperOnly: boolean): Mount {
    const room = this.room
    const sides: Array<[Mount['edge'], number]> = [['left', point.x - room.left], ['right', room.right - point.x]]
    sides.push(upperOnly ? ['ceiling', point.y - room.ceiling] : ['floor', room.floor - point.y])
    sides.sort((a, b) => a[1] - b[1])
    return this.mountFrom(point, sides[0]?.[0] ?? 'floor', upperOnly)
  }

  private mountFrom(point: Vector, edge: Mount['edge'], upperOnly = false): Mount {
    const { left, right, ceiling, floor } = this.room
    const sideY = clamp(point.y, ceiling + 43, upperOnly ? ceiling + (floor - ceiling) * 0.54 : floor - 54)
    const mountPoint = edge === 'left' || edge === 'right'
      ? { x: edge === 'left' ? left : right, y: sideY }
      : { x: clamp(point.x, left + 57, right - 57), y: edge === 'floor' ? floor : ceiling }
    return { point: mountPoint, normal: MOUNTS[edge], edge }
  }

  private bounds(point: Vector, margin = 0) {
    return { x: clamp(point.x, this.room.left + margin, this.room.right - margin), y: clamp(point.y, this.room.ceiling + margin, this.room.floor - margin) }
  }

  private addPad(mount: Mount) {
    if (this.pads.length === 2) {
      const oldest = this.pads.shift()
      if (oldest) Composite.remove(this.world, oldest.body)
    }
    const point = Vec.add(mount.point, Vec.mult(mount.normal, 9))
    const body = Bodies.rectangle(point.x, point.y, PAD_WIDTH, 16, {
      angle: mount.normal.x === 0 ? 0 : Math.PI / 2, isStatic: true, label: 'Trampoline',
      chamfer: { radius: 5 },
      collisionFilter: { category: FIXTURE_LAYER, mask: MOVING_LAYERS },
    })
    body.restitution = 1.65
    body.friction = 0.02
    this.pads.push({ body, mount, pulseUntil: 0 })
    Composite.add(this.world, body)
  }

  private addTurret(mount: Mount) {
    if (this.turrets.length === 4) this.turrets.shift()
    this.turrets.push({ mount, angle: Math.atan2(mount.normal.y, mount.normal.x), born: this.now, nextFire: this.now + 290 })
  }

  private dropAnvil(x: number) {
    if (this.now - this.impactAt < 170) return
    this.impactAt = this.now
    if (this.anvils.length === 6) {
      const oldest = this.anvils.shift()
      if (oldest) Composite.remove(this.world, oldest)
    }
    const body = Bodies.rectangle(clamp(x, this.room.left + 44, this.room.right - 44), this.room.ceiling + 29, 87, 49, {
      label: 'Cast-iron anvil', density: 0.015, friction: 0.24, restitution: 0.2, frictionAir: 0.003,
      chamfer: { radius: 7 }, collisionFilter: { category: PROP_LAYER, mask: SOLID_MASK },
    })
    Body.setVelocity(body, { x: 0, y: 13 })
    this.anvils.push(body)
    Composite.add(this.world, body)
  }

  private punch(point: Vector) {
    if (this.glove && this.now - this.glove.born < 295) return
    const side = point.x - this.room.left < this.room.right - point.x ? 1 : -1
    const from = { x: side > 0 ? this.room.left + 3 : this.room.right - 3, y: clamp(point.y, this.room.ceiling + 28, this.room.floor - 28) }
    const to = this.bounds({ x: point.x + side * 19, y: point.y }, 26)
    this.glove = { from, to, point: from, angle: Vec.angle(from, to), born: this.now, hit: false }
    this.director.sound({ kind: 'punch' })
  }

  private fireHeld() {
    if (!this.cursor || this.now < this.nextShot) return
    const paint = this.tool === 'paint'
    this.nextShot = this.now + (paint ? 122 : 294)
    const index = this.shotIndex++
    const kind: Ammo = paint ? (AMMO[index % AMMO.length] ?? 'paint') : index % 2 ? 'dart' : 'plunger'
    const { left, right, ceiling, floor } = this.room
    const from = {
      x: this.cursor.x >= (left + right) / 2 ? left + 13 : right - 13,
      y: clamp(this.cursor.y + 78, ceiling + 20, floor - 22),
    }
    this.fire(from, this.cursor, kind, COLORS[index % COLORS.length] ?? '#f650a0')
  }

  private fire(from: Vector, to: Vector, kind: Ammo, paintColor: string) {
    const direction = aim(from, to)
    if (Vec.magnitude(direction) < 0.1) return
    const radius = kind === 'egg' || kind === 'tomato' ? 8 : kind === 'plunger' ? 7 : 5
    const color = kind === 'egg' ? '#ffcb4c' : kind === 'tomato' ? '#ec5441' : kind === 'foam' ? '#f3e6bf' : paintColor
    const body = Bodies.circle(from.x, from.y, radius, {
      label: kind, isSensor: true, frictionAir: 0, collisionFilter: { mask: 0 },
    })
    Body.setVelocity(body, Vec.mult(direction, kind === 'foam' ? 36 : 54))
    const oldest = this.shots.length >= 42 ? this.shots.shift() : undefined
    if (oldest) Composite.remove(this.world, oldest.body)
    Composite.add(this.world, body)
    this.shots.push({ body, previous: from, kind, color, born: this.now, radius })
  }

  private movingBodies() {
    return this.ice ? [this.ice.body, ...this.anvils] : [...this.doll.limbs().map(limb => limb.body), ...this.anvils]
  }

  private targets(): Target[] {
    return this.ice ? [this.ice] : this.doll.limbs().map(limb => ({
      body: limb.body, width: limb.width, height: limb.height, limb,
    }))
  }

  private cast(targets: Target[], from: Vector, to: Vector, radius: number) {
    let first: { target: Target; time: number } | undefined
    for (const t of targets) {
      const time = contact(t, from, to, radius)
      if (time !== undefined && (!first || time < first.time)) first = { target: t, time }
    }
    if (!first) return undefined
    return {
      ...first.target,
      point: { x: from.x + (to.x - from.x) * first.time, y: from.y + (to.y - from.y) * first.time },
    }
  }

  private wallTime(from: Vector, to: Vector) {
    const { left, right, floor, ceiling } = this.room
    let time = 1
    if (to.x < left) time = Math.min(time, (left - from.x) / (to.x - from.x))
    if (to.x > right) time = Math.min(time, (right - from.x) / (to.x - from.x))
    if (to.y < ceiling) time = Math.min(time, (ceiling - from.y) / (to.y - from.y))
    if (to.y > floor) time = Math.min(time, (floor - from.y) / (to.y - from.y))
    return clamp(time, 0, 1)
  }

  private decal(shot: Shot, point: Vector, limb?: Limb) {
    const { kind, color } = shot
    if (kind === 'plunger' || kind === 'dart') return
    const local = limb ? localPoint(point, limb.body) : point
    const set = limb?.decals ?? this.wallDecals
    const limit = limb ? 16 : 96
    if (set.length >= limit) set.shift()
    set.push({
      x: limb ? clamp(local.x, -limb.width * 0.43, limb.width * 0.43) : local.x,
      y: limb ? clamp(local.y, -limb.height * 0.43, limb.height * 0.43) : local.y,
      kind, color, seed: this.decalIndex++ % 4, born: this.now,
      size: kind === 'egg' ? 22 : kind === 'foam' ? 9 : 17,
    })
    this.director.sound({ kind: 'splat', egg: kind === 'egg' })
  }

  private stick(limb: Limb, shot: Shot, point: Vector, direction: Vector) {
    if (shot.kind !== 'plunger' && shot.kind !== 'dart') return
    const local = localPoint(point, limb.body)
    const offset = {
      x: clamp(local.x, -limb.width * 0.48, limb.width * 0.48),
      y: clamp(local.y, -limb.height * 0.48, limb.height * 0.48),
    }
    if (this.attachments.length >= 10) {
      const oldest = this.attachments.shift()
      if (oldest) {
        this.emitShards(Vec.add(oldest.limb.body.position, Vec.rotate(oldest.offset, oldest.limb.body.angle)), 3)
        this.director.sound({ kind: 'pop' })
      }
    }
    this.attachments.push({
      limb, offset, angle: Math.atan2(-direction.y, -direction.x) - limb.body.angle, kind: shot.kind,
      wobble: 0, angularSpeed: 0.24,
    })
    this.director.sound({ kind: 'pop' })
  }

  private freezeDoll() {
    const limbs = this.doll.limbs()
    if (this.ice || !limbs.length) return
    const { left, right, ceiling, floor } = this.room
    const minX = Math.min(...limbs.map(limb => limb.body.bounds.min.x))
    const maxX = Math.max(...limbs.map(limb => limb.body.bounds.max.x))
    const minY = Math.min(...limbs.map(limb => limb.body.bounds.min.y))
    const maxY = Math.max(...limbs.map(limb => limb.body.bounds.max.y))
    const width = Math.min(maxX - minX + 23, right - left - 5)
    const height = Math.min(maxY - minY + 23, floor - ceiling - 5)
    const x = clamp((minX + maxX) / 2, left + width / 2 + 2, right - width / 2 - 2)
    const y = clamp((minY + maxY) / 2, ceiling + height / 2 + 2, floor - height / 2 - 2)
    const body = Bodies.rectangle(x, y, width, height, {
      label: 'Solid ice', chamfer: { radius: 10 }, friction: 0, frictionStatic: 0,
      frictionAir: 0.004, restitution: 0.36, density: 0.0016,
      collisionFilter: { category: PROP_LAYER, mask: ROOM_LAYER | PROP_LAYER | FIXTURE_LAYER },
    })
    const torso = this.doll.torso()
    if (torso) Body.setVelocity(body, Body.getVelocity(torso.body))
    this.ice = { body, width, height, pose: limbs.map(limb => ({ limb, offset: Vec.sub(limb.body.position, body.position), angle: limb.body.angle })) }
    this.doll.wake()
    this.doll.setSolid(true)
    Composite.add(this.world, body)
  }

  private syncIce() {
    if (!this.ice) return
    for (const { limb, offset, angle } of this.ice.pose) {
      Body.setPosition(limb.body, Vec.add(this.ice.body.position, Vec.rotate(offset, this.ice.body.angle)))
      Body.setAngle(limb.body, angle + this.ice.body.angle)
    }
  }

  private thaw(shatter: boolean, point?: Vector) {
    const ice = this.ice
    if (!ice) return
    this.syncIce()
    Composite.remove(this.world, ice.body)
    this.ice = null
    this.freezeProgress = 0
    this.doll.setSolid(false)
    for (const { limb, offset } of ice.pose) {
      const spread = Vec.normalise(offset)
      pushVelocity(limb.body, spread, shatter ? 7 : 0, 0)
      const velocity = Body.getVelocity(limb.body)
      const block = Body.getVelocity(ice.body)
      Body.setVelocity(limb.body, Vec.add(velocity, Vec.mult(block, 0.62)))
      Body.setAngularVelocity(limb.body, ice.body.angularVelocity * 0.55)
    }
    if (shatter) {
      const impactPoint = point ?? ice.body.position
      this.emitShards(ice.body.position, 35)
      this.emitShards(impactPoint, 12)
      this.director.rattle({ x: 0.6, y: -0.8 }, 12)
      this.director.sound({ kind: 'ice' })
    }
  }

  private emitShards(point: Vector, count: number) {
    for (let i = 0; i < count; i++) {
      const start = this.bounds(point, 1)
      if (this.shards.length >= 70) this.shards.shift()
      this.shards.push({
        ...start, vx: (Math.random() - 0.5) * 36, vy: -4 - Math.random() * 19,
        angle: Math.random() * 6.28, spin: Math.random() * 0.37 - 0.185, size: 3 + Math.random() * 14, age: 0,
      })
    }
  }

  update(dt: number) {
    const active = this.held && this.cursor
    if (active && (this.tool === 'paint' || this.tool === 'suction')) this.fireHeld()
    if (this.ice) this.freezeProgress = 1
    else {
      const frost = active && this.tool === 'freeze' && this.doll.limbs().some(limb =>
        Math.abs(limb.body.position.x - active.x) < limb.width / 2 + 34 && Math.abs(limb.body.position.y - active.y) < limb.height / 2 + 36)
      this.freezeProgress = clamp(this.freezeProgress + (frost ? dt / 930 : -dt / 2100), 0, 1)
      if (this.freezeProgress >= 1) this.freezeDoll()
    }
    this.director.hud.freezeProgress = Math.round(this.freezeProgress * 100)
    this.director.hud.frozen = Boolean(this.ice)
    this.director.hud.quake = this.now < this.quakeUntil
    if (!this.director.hud.quake) this.silenceQuake()
    if (this.shock && this.now - this.shock.time > 420) this.shock = null
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const turret = this.turrets[i]
      if (!turret) continue
      if (this.now - turret.born >= 15000) {
        this.turrets.splice(i, 1)
        continue
      }
      const target = this.ice?.body ?? this.doll.torso()?.body
      if (!target) continue
      const angle = Vec.angle(turret.mount.point, target.position)
      const turn = Math.atan2(Math.sin(angle - turret.angle), Math.cos(angle - turret.angle))
      turret.angle += turn * (1 - Math.exp(-dt / 83))
      if (this.now < turret.nextFire || Math.abs(turn) > 0.45) continue
      turret.nextFire = this.now + 240
      const direction = { x: Math.cos(turret.angle), y: Math.sin(turret.angle) }
      const kind = Math.floor((this.now - turret.born) / 240) % 3 === 0 ? 'paint' : 'foam'
      this.fire(Vec.add(turret.mount.point, Vec.mult(direction, 31)), target.position, kind, '#53bdf1')
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const shard = this.shards[i]
      if (!shard) continue
      const step = dt / STEP
      shard.age += dt
      shard.angle += shard.spin * step
      const next = this.bounds({ x: shard.x + shard.vx * step, y: shard.y + shard.vy * step })
      if (next.x === this.room.left || next.x === this.room.right) shard.vx *= -0.54
      if (next.y === this.room.floor || next.y === this.room.ceiling) shard.vy *= -0.48
      shard.x = next.x
      shard.y = next.y
      shard.vy += 0.53 * step
      if (shard.age > 1050) this.shards.splice(i, 1)
    }
  }

  beforeStep() {
    const ratio = this.engine.gravity.y + (GRAVITY[this.gravity] - this.engine.gravity.y) * 0.078
    this.engine.gravity.y = Math.abs(ratio - GRAVITY[this.gravity]) < 0.001 ? GRAVITY[this.gravity] : ratio
    const vortex = this.held && this.tool === 'vortex' ? this.cursor : null
    if (vortex) {
      this.doll.wake()
      const orbit = (point: Vector, vx: number, vy: number) => {
        const relative = Vec.sub(vortex, point)
        const distance = Vec.magnitude(relative)
        if (distance < 1) return { x: vx * 0.83, y: vy * 0.83 }
        const toward = Vec.mult(relative, 1 / distance)
        const pull = clamp((distance - 33) * 0.066, -2.2, 11)
        return {
          x: clamp(vx * 0.85 + toward.x * pull - toward.y * 3.65, -49, 49),
          y: clamp(vy * 0.85 + toward.y * pull + toward.x * 3.65, -49, 49),
        }
      }
      for (const body of this.movingBodies()) {
        const velocity = Body.getVelocity(body)
        Body.setVelocity(body, orbit(body.position, velocity.x, velocity.y))
      }
    }
    if (this.now < this.quakeUntil && this.now >= this.nextQuake) {
      this.nextQuake = this.now + 130
      const drift = Math.sin(this.now / 76)
      const shake = Math.sin(this.now / 37)
      for (const body of this.movingBodies()) {
        const nearEdge = Math.min(body.position.x - this.room.left, this.room.right - body.position.x, this.room.floor - body.position.y)
        pushVelocity(body, { x: drift, y: nearEdge < 100 ? -0.9 : shake * 0.6 }, 11)
      }
      this.director.rattle({ x: drift, y: shake * 0.58 }, 12)
    }
    for (const shot of this.shots) {
      shot.previous = { ...shot.body.position }
      Body.applyForce(shot.body, shot.body.position, { x: 0, y: -shot.body.mass * this.engine.gravity.y * this.engine.gravity.scale * 0.91 })
    }
  }

  afterStep() {
    if (this.ice && finiteBody(this.ice.body)) containBody(this.ice.body, this.room)
    if (this.thawAt) {
      const point = this.thawAt
      this.thawAt = null
      this.thaw(true, point)
    }
    this.syncIce()
    for (const attachment of this.attachments) {
      const { body } = attachment.limb
      const sag = Math.cos(body.angle + attachment.angle) * this.engine.gravity.y * 0.045
      const swing = sag - attachment.wobble * 0.26 - body.angularVelocity * 0.36
      attachment.angularSpeed = attachment.angularSpeed * 0.73 + swing
      attachment.wobble = clamp(attachment.wobble + attachment.angularSpeed, -0.58, 0.58)
    }
    for (const { body, normal, power } of this.rebounds) pushVelocity(body, normal, power, 0.65)
    this.rebounds.length = 0
    if (this.shots.length || this.glove) {
      const targets = this.targets()
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const shot = this.shots[i]
        if (!shot) continue
        const { previous, body, radius } = shot
        const t = this.wallTime(previous, body.position)
        const end = { x: previous.x + (body.position.x - previous.x) * t, y: previous.y + (body.position.y - previous.y) * t }
        const hit = this.cast(targets, previous, end, radius * 0.55)
        if (hit) {
          const direction = aim(previous, end)
          this.doll.wake()
          const impulse = shot.kind === 'foam' ? 3.7 : shot.kind === 'egg' || shot.kind === 'tomato' ? 8.3 : 10.8
          pushVelocity(hit.body, direction, impulse)
          Body.setAngularVelocity(hit.body, clamp(hit.body.angularVelocity + Vec.cross(Vec.sub(hit.point, hit.body.position), direction) * 0.002, -0.31, 0.31))
          if (hit.limb) {
            this.stick(hit.limb, shot, hit.point, direction)
            this.decal(shot, hit.point, hit.limb)
            this.director.impact(hit.point, Math.max(4.5, impulse - 1.4), direction, 0.26)
          } else if (shot.kind !== 'foam') {
            this.emitShards(hit.point, 2)
          }
        } else if (t < 1) {
          this.decal(shot, this.bounds(end))
        }
        if (hit || t < 1 || this.now - shot.born > 1050) {
          Composite.remove(this.world, body)
          this.shots.splice(i, 1)
        }
      }
      this.updateGlove(targets)
    }
    for (let i = this.anvils.length - 1; i >= 0; i--) {
      const anvil = this.anvils[i]
      if (!anvil) continue
      if (finiteBody(anvil)) containBody(anvil, this.room)
      else {
        Composite.remove(this.world, anvil)
        this.anvils.splice(i, 1)
      }
    }
  }

  private updateGlove(targets: Target[]) {
    const glove = this.glove
    if (!glove) return
    const age = this.now - glove.born
    if (age > 425) {
      this.glove = null
      return
    }
    const progress = age <= 145 ? 1 - (1 - age / 145) ** 2 : 1 - clamp((age - 180) / 245, 0, 1)
    const previous = glove.point
    glove.point = Vec.add(glove.from, Vec.mult(Vec.sub(glove.to, glove.from), progress))
    if (glove.hit || age > 170) return
    const hit = this.cast(targets, previous, glove.point, 22)
    if (!hit) return
    glove.hit = true
    const direction = aim(glove.from, glove.to)
    this.doll.wake()
    pushVelocity(hit.body, direction, 49, 0.4)
    if (!hit.limb) this.thawAt = hit.point
    else this.director.impact(hit.point, 24, direction, 0.72)
  }

  collision(pair: Pair, limb: Limb | undefined, wall: Vector | undefined) {
    if (!this.ice && !this.pads.length && !this.bumpers.length && !this.anvils.length) return
    const { bodyA, bodyB } = pair
    const other = (body: RigidBody) => bodyA === body ? bodyB : bodyA
    const has = (body: RigidBody) => body === bodyA || body === bodyB
    const anvil = this.anvils.find(has)
    const ice = this.ice?.body
    const support = pair.collision.supports[0]
    if (ice && has(ice) && (wall || anvil)) {
      const normal = wall ?? aim(other(ice).position, ice.position)
      const approach = Math.abs(Vec.dot(Vec.sub(Body.getVelocity(ice), Body.getVelocity(other(ice))), normal))
      if (approach > ICE_HIT || (anvil && approach > 9)) this.thawAt = support ?? ice.position
    }
    if (anvil) {
      const velocity = Body.getVelocity(anvil)
      if ((wall || limb || ice === other(anvil)) && Vec.magnitude(velocity) > 7 && this.now - this.clangAt > 115) {
        this.clangAt = this.now
        this.director.sound({ kind: 'anvil', speed: Vec.magnitude(velocity) })
      }
      if (limb && Math.abs(velocity.y) > 9) {
        this.doll.wake()
        this.director.impact(support ?? limb.body.position, Math.min(28, Math.abs(velocity.y) + 5), { x: 0, y: 1 }, 0.84)
        this.rebounds.push({ body: limb.body, normal: { x: 0, y: 1 }, power: 17 })
      } else if (wall && Vec.magnitude(velocity) > 10) {
        this.director.rattle(wall, 12)
      }
    }
    const pad = this.pads.find(p => has(p.body))
    const bumper = this.bumpers.find(b => has(b.body))
    const fixture = pad ?? bumper
    if (!fixture) return
    const body = other(fixture.body)
    const normal = pad?.mount.normal ?? aim(fixture.body.position, body.position)
    const incoming = -Vec.dot(Body.getVelocity(body), normal)
    if (incoming < 1.5 || this.now < fixture.pulseUntil - 85) return
    fixture.pulseUntil = this.now + 205
    this.director.sound({ kind: 'boing', speed: incoming })
    this.rebounds.push({ body, normal, power: clamp(incoming * 0.58 + (pad ? 20 : 16), 14, 39) })
    if (limb || body === ice) {
      const point = support ?? body.position
      this.director.impact(point, pad ? 7 : 9, normal, 0)
    }
  }
}
