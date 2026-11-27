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
export const OUTFITS = {
  studio: { label: 'Studio green', color: '#586c61', denim: ['#748379', '#55665e', '#344640'], pelvis: ['#8c8b68', '#656e55', '#394237'] },
  clay: { label: 'Kiln red', color: '#a44f3c', denim: ['#bb7559', '#944b3a', '#593329'], pelvis: ['#9f755b', '#7f5040', '#543529'] },
  indigo: { label: 'Workwear blue', color: '#465e79', denim: ['#667f96', '#415773', '#2b354e'], pelvis: ['#738392', '#536172', '#383f58'] },
} as const
export type Outfit = keyof typeof OUTFITS
export type Profile = { name: string; roasts: string[]; face: string | null; blend: boolean; outfit: Outfit }
export type Hud = { coins: number; integrity: number; combo: number; comboTime: number; mood: Mood; freezeProgress: number; frozen: boolean; quake: boolean }
export type DareStats = { damage: number; maxCombo: number; coins: number; roast: string; destroyed: boolean }

export const DEFAULT_PROFILE: Profile = { name: 'Buddy', roasts: [], face: null, blend: true, outfit: 'studio' }
export const INITIAL_HUD: Hud = { coins: 0, integrity: 100, combo: 0, comboTime: 0, mood: 'Curious', freezeProgress: 0, frozen: false, quake: false }
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function isOutfit(value: unknown): value is Outfit {
  return typeof value === 'string' && Object.hasOwn(OUTFITS, value)
}

export function profileFrom(value: unknown): Profile | null {
  if (typeof value !== 'object' || value === null) return null
  return {
    name: 'name' in value && typeof value.name === 'string' ? value.name.trim().slice(0, 24) || DEFAULT_PROFILE.name : DEFAULT_PROFILE.name,
    roasts: 'roasts' in value && Array.isArray(value.roasts)
      ? value.roasts.filter((line: unknown): line is string => typeof line === 'string').map(line => line.trim().slice(0, 85)).filter(Boolean).slice(0, 8)
      : [],
    face: 'face' in value && typeof value.face === 'string' && value.face.length <= 600000 &&
      /^data:image\/(webp|png|jpeg);base64,[\da-z+/]+={0,2}$/i.test(value.face) ? value.face : null,
    outfit: 'outfit' in value && isOutfit(value.outfit) ? value.outfit : DEFAULT_PROFILE.outfit,
    blend: !('blend' in value) || value.blend !== false,
  }
}

export function localPoint(point: Vector, body: Body): Vector {
  const x = point.x - body.position.x
  const y = point.y - body.position.y
  const c = Math.cos(body.angle)
  const s = Math.sin(body.angle)
  return { x: x * c + y * s, y: y * c - x * s }
}
