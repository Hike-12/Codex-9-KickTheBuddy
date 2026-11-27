import type { Body, Vector } from 'matter-js'
import type { Decal } from './gadgetModel'

export type Surface = 'burlap' | 'denim' | 'pelvis' | 'head' | 'hand' | 'boot'
export type Limb = {
  body: Body
  width: number
  height: number
  radius: number
  surface: Surface
  marks: Array<{ x: number; y: number; angle: number; bandage: boolean }>
  decals: Decal[]
}
export type Room = { width: number; height: number; left: number; right: number; ceiling: number; floor: number }
export type Mood = 'Curious' | 'Happy' | 'Rattled' | 'Dizzy'
export type Expression = 'shock' | 'stars' | 'spirals' | 'sweat'
export type Profile = { name: string; roasts: string[]; face: string | null; blend: boolean }
export type Hud = { coins: number; integrity: number; combo: number; comboTime: number; mood: Mood; freezeProgress: number; frozen: boolean; quake: boolean }

export const DEFAULT_PROFILE: Profile = { name: 'Buddy', roasts: [], face: null, blend: true }
export const INITIAL_HUD: Hud = { coins: 0, integrity: 100, combo: 0, comboTime: 0, mood: 'Curious', freezeProgress: 0, frozen: false, quake: false }
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function localPoint(point: Vector, body: Body): Vector {
  const x = point.x - body.position.x
  const y = point.y - body.position.y
  const c = Math.cos(body.angle)
  const s = Math.sin(body.angle)
  return { x: x * c + y * s, y: y * c - x * s }
}
