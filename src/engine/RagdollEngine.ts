import Matter from 'matter-js'
import type { Body as RigidBody, Composite as MatterComposite, Constraint as Pin, IEventCollision, Mouse as MatterMouse, Vector } from 'matter-js'
import { GameDirector } from './GameDirector'
import type { Foley } from './CartoonAudio'
import { GadgetSystem } from './GadgetSystem'
import { RagdollRenderer } from './RagdollRenderer'
import { DOLL_LAYER as DOLL, FIXTURE_LAYER, MOVING_LAYERS, PROP_LAYER, ROOM_LAYER as ROOM, STEP } from './gadgetModel'
import type { GravityMode, Tool } from './gadgetModel'
import { clamp, localPoint } from './model'
import type { Hud, Limb, Profile, Room, Surface } from './model'
import { containBody, emptyExtents, finiteBody, fitTranslation, includeBody, mayHaveEscaped, moveInward } from './roomBounds'

const { Bodies, Body, Composite, Constraint, Engine, Events, MouseConstraint, Query, Sleeping, Vector: Vec } = Matter
const PARTS = {
  head: [0, 0, 111, 101, 39, 'head'],
  torso: [0, 99, 86, 90, 23, 'denim'],
  pelvis: [0, 155, 76, 54, 21, 'pelvis'],
  upperL: [-55, 92, 30, 60, 15, 'burlap'],
  upperR: [55, 92, 30, 60, 15, 'burlap'],
  handL: [-57, 140, 32, 57, 16, 'hand'],
  handR: [57, 140, 32, 57, 16, 'hand'],
  thighL: [-22, 192, 36, 63, 17, 'burlap'],
  thighR: [22, 192, 36, 63, 17, 'burlap'],
  bootL: [-24, 239, 40, 62, 16, 'boot'],
  bootR: [24, 239, 40, 62, 16, 'boot'],
} satisfies Record<string, [number, number, number, number, number, Surface]>

type Part = keyof typeof PARTS
const DRAW_ORDER: Part[] = ['upperL', 'upperR', 'thighL', 'thighR', 'bootL', 'bootR', 'handL', 'handR', 'pelvis', 'torso', 'head']
const JOINTS: Array<[Part, Part, number, number, number, number]> = [
  ['torso', 'head', 0, 51, 0.48, 0.11],
  ['torso', 'pelvis', 0, 133, 0.38, 0.12],
  ['torso', 'upperL', -41, 69, 1.32, 0.045],
  ['torso', 'upperR', 41, 69, 1.32, 0.045],
  ['upperL', 'handL', -56, 116, 1.12, 0.04],
  ['upperR', 'handR', 56, 116, 1.12, 0.04],
  ['pelvis', 'thighL', -22, 173, 0.83, 0.067],
  ['pelvis', 'thighR', 22, 173, 0.83, 0.067],
  ['thighL', 'bootL', -24, 216, 1.03, 0.055],
  ['thighR', 'bootR', 24, 216, 1.03, 0.055],
]

type Joint = { a: RigidBody; b: RigidBody; limit: number; spring: number }
type Doll = { composite: MatterComposite; limbs: Limb[]; head: Limb; joints: Joint[]; suspension: Pin | null }
type Pointer = { id: number; point: Vector; velocity: Vector; time: number }

const zero = () => ({ x: 0, y: 0 })

export class RagdollEngine {
  private engine = Engine.create({ positionIterations: 9, velocityIterations: 7, constraintIterations: 5 })
  private walls = Composite.create({ label: 'Studio boundaries' })
  private limbByBody = new Map<number, Limb>()
  private wallDirection = new Map<number, Vector>()
  private renderer: RagdollRenderer
  private director: GameDirector
  private gadgets: GadgetSystem
  private mouse: MatterMouse & { sourceEvents: { mousemove: null; mousedown: null; mouseup: null; mousewheel: null } }
  private grabConstraint: Omit<Matter.MouseConstraint, 'body'> & { body: RigidBody | null }
  private observer: ResizeObserver
  private events = new AbortController()
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  private room: Room = { width: 1, height: 1, left: 0, right: 1, ceiling: 0, floor: 1 }
  private doll: Doll | null = null
  private cssScale = 1
  private tokenTarget: Vector = { x: 90, y: 33 }
  private pointer: Pointer | null = null
  private gadgetPointer: number | null = null
  private hover: { point: Vector; time: number } | null = null
  private frame = 0
  private previousTime = 0
  private accumulator = 0
  private lastHud = -100
  private lastSnapshot: Hud | null = null
  private paused = false
  private glovePrimary = false
  private capturing = false
  private pixelRatio = 1

  constructor(private canvas: HTMLCanvasElement, private coinLabel: HTMLElement, profile: Profile, private onHud: (hud: Hud) => void, sound: (event: Foley) => void) {
    this.renderer = new RagdollRenderer(canvas)
    this.director = new GameDirector(profile, sound)
    this.gadgets = new GadgetSystem(this.engine, this.director, {
      limbs: () => this.doll?.limbs ?? [],
      torso: () => this.doll?.limbs.find(limb => limb.surface === 'denim'),
      wake: () => this.unhang(),
      setSolid: solid => {
        const doll = this.doll
        if (!doll) return
        if (solid) {
          this.releaseGrab()
          Composite.remove(this.engine.world, doll.composite)
        } else {
          this.releaseGrab()
          if (!this.engine.world.composites.includes(doll.composite)) Composite.add(this.engine.world, doll.composite)
        }
      },
    })
    this.renderer.setProfile(profile)
    Composite.add(this.engine.world, this.walls)
    // A PointerEvents adapter drives Matter's spring without its parallel mouse/touch listeners.
    this.mouse = {
      element: canvas, position: zero(), absolute: zero(), mousedownPosition: zero(), mouseupPosition: zero(),
      offset: zero(), scale: { x: 1, y: 1 }, button: -1, wheelDelta: 0, pixelRatio: 1,
      sourceEvents: { mousemove: null, mousedown: null, mouseup: null, mousewheel: null },
    }
    const grabConstraint = MouseConstraint.create(this.engine, {
      mouse: this.mouse,
      constraint: { stiffness: 0.27, damping: 0.14 },
      collisionFilter: { category: ROOM, mask: MOVING_LAYERS, group: 0 },
    })
    this.grabConstraint = grabConstraint
    Composite.add(this.engine.world, grabConstraint)
    Events.on(this.engine, 'collisionStart', this.onCollision)
    const { signal } = this.events
    canvas.addEventListener('pointerdown', this.onDown, { signal })
    canvas.addEventListener('pointermove', this.onMove, { signal })
    canvas.addEventListener('pointerup', this.onUp, { signal })
    canvas.addEventListener('pointercancel', this.onCancel, { signal })
    canvas.addEventListener('lostpointercapture', this.onCancel, { signal })
    canvas.addEventListener('pointerleave', this.onLeave, { signal })
    canvas.addEventListener('contextmenu', this.onContextMenu, { signal })
    document.addEventListener('visibilitychange', this.onVisibility, { signal })
    window.addEventListener('blur', this.onBlur, { signal })
    window.addEventListener('resize', this.resize, { signal })
    window.addEventListener('pointerup', this.stopQuakeAudio, { signal })
    window.addEventListener('pointercancel', this.stopQuakeAudio, { signal })
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(canvas)
    this.observer.observe(coinLabel)
    this.resize()
    this.spawn(true)
    if (!document.hidden) this.frame = requestAnimationFrame(this.tick)
  }

  setProfile(profile: Profile) {
    this.director.setProfile(profile)
    this.renderer.setProfile(profile)
  }

  scorecard() { return this.director.scorecard() }

  setCapturing(active: boolean) {
    if (this.capturing === active) return
    this.capturing = active
    this.resize()
    this.drawFrame()
  }

  setPaused(paused: boolean) {
    this.paused = paused
    if (paused) this.release()
  }

  setTool(tool: Tool) {
    if (this.gadgets.tool === tool) return
    this.release()
    this.gadgets.setTool(tool)
    this.canvas.dataset.tool = tool
    this.canvas.dataset.hover = 'false'
    this.hover = null
  }

  setGravity(mode: GravityMode) { this.gadgets.setGravity(mode) }
  setBumpers(enabled: boolean) { this.gadgets.setBumpers(enabled) }
  setGlovePrimary(enabled: boolean) { this.glovePrimary = enabled }
  quake() { this.gadgets.quake() }

  clearRoom() {
    this.release()
    this.gadgets.clear()
    this.containDoll(true)
    this.gadgets.update(0)
    this.publishHud(true)
  }

  reset() {
    this.release()
    this.director.reset(true)
    this.spawn(false)
    this.publishHud(true)
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.release()
    this.events.abort()
    this.observer.disconnect()
    Events.off(this.engine, 'beforeUpdate collisionStart')
    this.gadgets.clear()
    Composite.clear(this.engine.world, false, true)
    Engine.clear(this.engine)
    this.renderer.dispose()
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const roomWidth = rect.width <= 510 ? 560 : 690
    const floorRatio = rect.width <= 510 && rect.height < 670 ? 0.79 : 0.835
    const shortLandscape = rect.width > rect.height && rect.height <= 470 && rect.width <= 820
    const ceilingCss = Math.max(rect.height * 0.103, shortLandscape
      ? Math.min(142, rect.height * 0.45)
      : Math.min(rect.width <= 760 ? 196 : 132, rect.height * 0.35))
    const floorCss = rect.height * floorRatio
    this.cssScale = Math.min(Math.min(rect.width / roomWidth, rect.height / 625) * 1.07,
      (floorCss - ceilingCss) / 378, rect.width * 0.826 / 378, 1.45)
    const width = rect.width / this.cssScale
    const height = rect.height / this.cssScale
    const old = this.room
    const gutter = Math.min(width * 0.087, 102)
    this.room = { width, height, left: gutter, right: width - gutter, ceiling: ceilingCss / this.cssScale, floor: floorCss / this.cssScale }
    const { left, right, floor, ceiling } = this.room
    const pixelRatio = this.pixelRatio = Math.min(devicePixelRatio || 1, 2)
    const captureRatio = this.capturing ? Math.sqrt((800 * 450) / (rect.width * rect.height)) : pixelRatio
    this.renderer.resize(this.room, this.cssScale, Math.min(pixelRatio, captureRatio))
    const coin = this.coinLabel.getBoundingClientRect()
    if (coin.width) this.tokenTarget = { x: (coin.left + coin.width / 2 - rect.left) / this.cssScale, y: (coin.top + coin.height / 2 - rect.top) / this.cssScale }
    if (width === old.width && height === old.height && ceiling === old.ceiling && floor === old.floor) return
    this.onBlur()

    const doll = this.doll
    if (doll && !this.gadgets.ice) {
      const head = doll.head.body.position
      const extents = emptyExtents()
      for (const limb of doll.limbs) includeBody(extents, limb.body)
      const translation = fitTranslation(extents, this.room, {
        x: clamp(head.x / old.width * width, left + 76, right - 76) - head.x, y: floor - old.floor,
      })
      Composite.translate(doll.composite, translation)
      if (doll.suspension) {
        doll.suspension.pointA.x += translation.x
        doll.suspension.pointA.y += translation.y
      }
    }

    Composite.clear(this.walls, false)
    this.wallDirection.clear()
    const thickness = 200
    const wall = (x: number, y: number, w: number, h: number, direction: Vector) => {
      const body = Bodies.rectangle(x, y, w, h, {
        isStatic: true,
        collisionFilter: { category: ROOM, mask: MOVING_LAYERS },
      })
      body.restitution = 0.57
      body.friction = 0.24
      this.wallDirection.set(body.id, direction)
      Composite.add(this.walls, body)
    }
    wall(left - thickness / 2, height / 2, thickness, height + thickness, { x: 1, y: 0 })
    wall(right + thickness / 2, height / 2, thickness, height + thickness, { x: -1, y: 0 })
    wall(width / 2, ceiling - thickness / 2, width + thickness, thickness, { x: 0, y: 1 })
    wall(width / 2, floor + thickness / 2, width + thickness, thickness, { x: 0, y: -1 })
    this.gadgets.resize(this.room)
    this.containDoll(true)
  }

  private spawn(hang: boolean) {
    this.removeDoll()
    const composite = Composite.create({ label: 'Jute ragdoll' })
    const center = this.room.width * 0.5
    const y = hang ? this.room.floor - 301 : Math.min(this.room.ceiling + 68, this.room.floor - 274)
    const group = Body.nextGroup(true)
    const makeLimb = (key: Part): Limb => {
      const [x, dy, width, height, radius, surface] = PARTS[key]
      const body = Bodies.rectangle(center + x, y + dy, width, height, {
        label: key, chamfer: { radius: radius * 0.72 }, density: surface === 'head' ? 0.00115 : 0.0016,
        restitution: 0.52, friction: 0.29, frictionAir: 0.014,
        collisionFilter: { group, category: DOLL, mask: ROOM | PROP_LAYER | FIXTURE_LAYER },
      })
      const limb = { body, width, height, radius, surface, marks: [], decals: [] }
      this.limbByBody.set(body.id, limb)
      Composite.add(composite, body)
      return limb
    }
    const limbs = new Map(DRAW_ORDER.map(key => [key, makeLimb(key)]))
    const head = limbs.get('head')
    if (!head) return
    const joints: Joint[] = []
    for (const [a, b, dx, dy, limit, spring] of JOINTS) {
      const first = limbs.get(a)?.body
      const second = limbs.get(b)?.body
      if (!first || !second) continue
      const pivot = { x: center + dx, y: y + dy }
      Composite.add(composite, Constraint.create({
        bodyA: first, bodyB: second, pointA: localPoint(pivot, first), pointB: localPoint(pivot, second),
        length: 0, stiffness: 0.91, damping: 0.19,
      }))
      joints.push({ a: first, b: second, limit, spring })
    }
    const suspension = hang ? Constraint.create({
      pointA: { x: center, y: y - 43 }, bodyB: head.body, pointB: { x: 0, y: -43 },
      stiffness: 0.8, damping: 0.22, length: 0,
    }) : null
    if (suspension) Composite.add(composite, suspension)
    Composite.add(this.engine.world, composite)
    this.doll = { composite, limbs: [...limbs.values()], head, joints, suspension }
    if (!hang) Body.setAngularVelocity(head.body, 0.033)
  }

  private removeDoll() {
    if (!this.doll) return
    this.gadgets.resetDoll()
    Composite.remove(this.engine.world, this.doll.composite)
    this.limbByBody.clear()
    this.doll = null
  }

  private hit(point: Vector) {
    if (!this.doll) return undefined
    if (this.gadgets.ice) return Query.point([this.gadgets.ice.body], point)[0]
    for (let i = this.doll.limbs.length - 1; i >= 0; i--) {
      const body = this.doll.limbs[i]?.body
      if (body && Query.point([body], point).length) return body
    }
    return undefined
  }

  private pointerPoint(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / this.cssScale, y: (event.clientY - rect.top) / this.cssScale }
  }

  private onDown = (event: PointerEvent) => {
    if (this.pointer || this.gadgetPointer !== null || this.paused || !event.isPrimary) return
    const point = this.pointerPoint(event)
    if (this.gadgets.tool !== 'grab') {
      if (event.button !== 0 && !(event.button === 2 && this.gadgets.tool === 'impact')) return
      this.gadgetPointer = event.pointerId
      this.canvas.setPointerCapture(event.pointerId)
      this.gadgets.press(point, this.glovePrimary || event.shiftKey || event.button === 2)
      return
    }
    if (event.button !== 0) return
    const body = this.hit(point)
    if (!body || !this.doll) return
    this.pointer = { id: event.pointerId, point, velocity: zero(), time: event.timeStamp }
    this.canvas.setPointerCapture(event.pointerId)
    this.canvas.dataset.grabbing = 'true'
    this.unhang()
    Object.assign(this.mouse.position, point)
    this.mouse.button = 0
    const spring: Pin & { angleB?: number } = this.grabConstraint.constraint
    // Matter rotates the anchor incrementally starting at the body's angle at pickup.
    spring.bodyB = body
    spring.pointB = Vec.sub(point, body.position)
    spring.angleB = body.angle
    this.grabConstraint.body = body
    Sleeping.set(body, false)
    this.director.grab()
  }

  private onMove = (event: PointerEvent) => {
    if (!event.isPrimary || this.paused) return
    const point = this.pointerPoint(event)
    if (this.gadgets.tool !== 'grab') {
      this.gadgets.move(point)
      return
    }
    if (this.pointer?.id === event.pointerId) {
      const { left, right, floor, ceiling } = this.room
      const p = this.pointer
      const dt = Math.max(5, event.timeStamp - p.time)
      p.velocity = {
        x: p.velocity.x * 0.28 + (point.x - p.point.x) * STEP / dt * 0.72,
        y: p.velocity.y * 0.28 + (point.y - p.point.y) * STEP / dt * 0.72,
      }
      p.point = point
      p.time = event.timeStamp
      this.mouse.position.x = clamp(point.x, left - 24, right + 24)
      this.mouse.position.y = clamp(point.y, ceiling - 24, floor + 24)
      return
    }
    if (this.pointer || !event.isPrimary || this.paused || (event.buttons && event.pointerType !== 'touch')) return
    const body = this.hit(point)
    this.canvas.dataset.hover = body ? 'true' : 'false'
    const previous = this.hover
    this.hover = { point, time: event.timeStamp }
    if (body && previous && !this.gadgets.ice) {
      const distance = Math.hypot(point.x - previous.point.x, point.y - previous.point.y)
      if (distance >= 0.8 && distance / Math.max(5, event.timeStamp - previous.time) < 1.24) this.director.pet(point)
    }
  }

  private onUp = (event: PointerEvent) => {
    if (this.gadgetPointer === event.pointerId) {
      this.stopGadget(true)
      return
    }
    const pointer = this.pointer
    if (!pointer || pointer.id !== event.pointerId) return
    const body = this.grabConstraint.constraint.bodyB
    if (body && event.timeStamp - pointer.time < 100) {
      const speed = Vec.magnitude(pointer.velocity)
      if (speed > 5) {
        const impetus = Vec.mult(pointer.velocity, Math.min(0.55, 32 / speed))
        const old = Body.getVelocity(body)
        Body.setVelocity(body, { x: clamp(old.x * 0.66 + impetus.x, -49, 49), y: clamp(old.y * 0.66 + impetus.y, -49, 49) })
      }
    }
    this.releaseGrab()
  }

  private onCancel = (event: PointerEvent) => {
    if (this.pointer?.id === event.pointerId) this.releaseGrab()
    if (this.gadgetPointer === event.pointerId) this.stopGadget(false)
  }

  private onLeave = () => {
    this.hover = null
    this.canvas.dataset.hover = 'false'
    if (this.gadgetPointer === null) this.gadgets.move(null)
  }

  private onContextMenu = (event: MouseEvent) => {
    if (this.gadgets.tool === 'impact') event.preventDefault()
  }

  private release() {
    this.releaseGrab()
    this.stopGadget(false)
  }

  private onBlur = () => {
    this.release()
    this.hover = null
    this.gadgets.move(null)
    delete this.canvas.dataset.hover
  }

  private stopQuakeAudio = () => this.gadgets.silenceQuake()

  private stopGadget(detonate: boolean) {
    const id = this.gadgetPointer
    this.gadgetPointer = null
    this.gadgets.release(detonate)
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
  }

  private unhang() {
    if (!this.doll?.suspension) return
    Composite.remove(this.doll.composite, this.doll.suspension)
    this.doll.suspension = null
  }

  private releaseGrab() {
    const id = this.pointer?.id
    this.pointer = null
    this.mouse.button = -1
    this.grabConstraint.constraint.bodyB = null
    this.grabConstraint.constraint.pointB = zero()
    this.grabConstraint.body = null
    delete this.canvas.dataset.grabbing
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
  }

  private onCollision = (event: IEventCollision<Matter.Engine>) => {
    let strongest: { limb: Limb; direction: Vector; point: Vector; speed: number } | undefined
    for (const pair of event.pairs) {
      const limb = this.limbByBody.get(pair.bodyA.id) ?? this.limbByBody.get(pair.bodyB.id)
      const direction = this.wallDirection.get(pair.bodyA.id) ?? this.wallDirection.get(pair.bodyB.id)
      this.gadgets.collision(pair, limb, direction)
      if (!limb || !direction) continue
      const speed = -Vec.dot(limb.body.velocity, direction)
      if (speed <= (strongest?.speed ?? 0)) continue
      const support = pair.collision.supports[0] ?? limb.body.position
      strongest = { limb, direction, speed, point: { x: support.x, y: support.y } }
    }
    if (!strongest || !this.doll) return
    const { limb, direction, speed, point } = strongest
    if (this.director.impact(point, speed, direction)) {
      const local = localPoint(point, limb.body)
      if (limb.marks.length >= 5) limb.marks.shift()
      limb.marks.push({
        x: clamp(local.x * 0.62, -limb.width * 0.3, limb.width * 0.3),
        y: clamp(local.y * 0.62, -limb.height * 0.3, limb.height * 0.3),
        angle: Math.random() - 0.5, bandage: limb.marks.length % 2 === 1 || speed >= 22,
      })
    }
  }

  private step() {
    if (this.director.now < this.director.freezeUntil) return
    this.gadgets.beforeStep()
    for (const { a, b, limit, spring } of this.gadgets.ice ? [] : this.doll?.joints ?? []) {
      const angle = b.angle - a.angle
      const error = Math.atan2(Math.sin(angle), Math.cos(angle))
      const extra = error - clamp(error, -limit, limit)
      const correction = clamp(error * spring * 0.12 + extra * 0.17 + (b.angularVelocity - a.angularVelocity) * 0.13, -0.22, 0.22)
      Body.setAngularVelocity(b, b.angularVelocity - correction)
      Body.setAngularVelocity(a, a.angularVelocity + correction * 0.29)
    }
    Engine.update(this.engine, STEP)
    this.gadgets.afterStep()
    if (!this.containDoll()) return
    if (this.director.hud.integrity <= 0 && this.doll) {
      this.director.pop(this.doll.head.body.position)
      this.release()
      this.removeDoll()
    }
  }

  private containDoll(strict = false) {
    const { doll, room } = this
    if (!doll) return true
    const ice = this.gadgets.ice?.body
    if (ice ? !finiteBody(ice) : doll.limbs.some(({ body }) => !finiteBody(body))) {
      this.reset()
      return false
    }
    if (ice || (!strict && !doll.limbs.some(({ body }) => mayHaveEscaped(body, room)))) return true
    const extents = emptyExtents()
    for (const limb of doll.limbs) includeBody(extents, limb.body)
    const slack = strict ? 0 : 12
    if (extents.left >= room.left - slack && extents.right <= room.right + slack &&
        extents.ceiling >= room.ceiling - slack && extents.floor <= room.floor + slack) return true
    const delta = fitTranslation(extents, room, zero())
    for (const limb of doll.limbs) moveInward(limb.body, delta)
    if (doll.suspension) {
      doll.suspension.pointA.x += delta.x
      doll.suspension.pointA.y += delta.y
    }
    if (extents.right - extents.left > room.right - room.left || extents.floor - extents.ceiling > room.floor - room.ceiling) {
      for (const limb of doll.limbs) containBody(limb.body, room, true)
    }
    return true
  }

  private publishHud(force = false) {
    if (!force && this.director.now - this.lastHud < 83) return
    this.lastHud = this.director.now
    const hud = this.director.hud
    const last = this.lastSnapshot
    if (!force && last && hud.coins === last.coins && hud.integrity === last.integrity &&
      hud.combo === last.combo && hud.mood === last.mood && hud.comboTime === last.comboTime &&
      hud.freezeProgress === last.freezeProgress && hud.frozen === last.frozen && hud.quake === last.quake) return
    this.lastSnapshot = { ...hud }
    this.onHud(this.lastSnapshot)
  }

  private tick = (time: number) => {
    if (Math.min(devicePixelRatio || 1, 2) !== this.pixelRatio) this.resize()
    const dt = this.previousTime ? Math.min(time - this.previousTime, STEP * 4) : 0
    this.previousTime = time
    if (!this.paused) {
      this.director.advance(dt, this.room, this.tokenTarget)
      this.gadgets.update(dt)
      if (this.director.respawnAt && this.director.now >= this.director.respawnAt) {
        this.director.reset(false)
        this.spawn(false)
      }
      this.accumulator += dt
      while (this.accumulator >= STEP) {
        this.step()
        this.accumulator -= STEP
      }
      this.publishHud()
    }
    this.drawFrame()
    this.frame = requestAnimationFrame(this.tick)
  }

  private drawFrame() {
    const spring = this.grabConstraint.constraint
    const drag = this.pointer && spring.bodyB && spring.pointB
      ? { from: this.mouse.position, to: Vec.add(spring.bodyB.position, spring.pointB) }
      : null
    this.renderer.draw(this.room, this.doll?.limbs ?? [], this.doll?.head ?? null,
      this.director, drag, Boolean(this.doll?.suspension), this.reducedMotion.matches, this.gadgets)
  }

  private onVisibility = () => {
    cancelAnimationFrame(this.frame)
    this.previousTime = 0
    this.accumulator = 0
    if (document.hidden) this.onBlur()
    else this.frame = requestAnimationFrame(this.tick)
  }
}
