import Matter from 'matter-js'
import type { Body, Vector } from 'matter-js'
import { clamp } from './model'
import type { Room } from './model'

type Extents = Pick<Room, 'left' | 'right' | 'ceiling' | 'floor'>
const { Body: RigidBody, Vector: Vec } = Matter
const CONTACT_SLACK = 12

export function finiteBody(body: Body) {
  return Number.isFinite(body.position.x) && Number.isFinite(body.position.y) &&
    Number.isFinite(body.angle) && Number.isFinite(body.angularVelocity) &&
    Number.isFinite(body.bounds.min.x) && Number.isFinite(body.bounds.min.y) &&
    Number.isFinite(body.bounds.max.x) && Number.isFinite(body.bounds.max.y)
}

export function mayHaveEscaped(body: Body, room: Room) {
  const { min, max } = body.bounds
  return min.x < room.left - CONTACT_SLACK || max.x > room.right + CONTACT_SLACK ||
    min.y < room.ceiling - CONTACT_SLACK || max.y > room.floor + CONTACT_SLACK
}

// Matter expands its bounds in the direction of travel. Use the vertices for correction.
export function includeBody(extents: Extents, body: Body) {
  for (const vertex of body.vertices) {
    extents.left = Math.min(extents.left, vertex.x)
    extents.right = Math.max(extents.right, vertex.x)
    extents.ceiling = Math.min(extents.ceiling, vertex.y)
    extents.floor = Math.max(extents.floor, vertex.y)
  }
}

export function emptyExtents(): Extents {
  return { left: Infinity, right: -Infinity, ceiling: Infinity, floor: -Infinity }
}

export function fitTranslation(extents: Extents, room: Room, offset: Vector, slack = 0): Vector {
  const fit = (value: number, lower: number, upper: number) => lower <= upper
    ? clamp(value, lower, upper)
    : (lower + upper) / 2
  return {
    x: fit(offset.x, room.left - extents.left - slack, room.right - extents.right + slack),
    y: fit(offset.y, room.ceiling - extents.ceiling - slack, room.floor - extents.floor + slack),
  }
}

export function moveInward(body: Body, delta: Vector) {
  if (!delta.x && !delta.y) return
  const velocity = RigidBody.getVelocity(body)
  RigidBody.setPosition(body, Vec.add(body.position, delta))
  RigidBody.setVelocity(body, {
    x: velocity.x * delta.x < 0 ? 0 : velocity.x,
    y: velocity.y * delta.y < 0 ? 0 : velocity.y,
  })
}

export function containBody(body: Body, room: Room, strict = false) {
  if (!strict && !mayHaveEscaped(body, room)) return
  const extents = emptyExtents()
  includeBody(extents, body)
  const slack = strict ? 0 : CONTACT_SLACK
  if (extents.left >= room.left - slack && extents.right <= room.right + slack &&
    extents.ceiling >= room.ceiling - slack && extents.floor <= room.floor + slack) return
  moveInward(body, fitTranslation(extents, room, { x: 0, y: 0 }))
}
