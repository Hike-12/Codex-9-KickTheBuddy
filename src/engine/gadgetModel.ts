import type { Body, Vector } from 'matter-js'
import type { Limb } from './model'

export const TOOLS = ['grab', 'paint', 'suction', 'impact', 'vortex', 'freeze', 'trampoline', 'turret'] as const
export type Tool = typeof TOOLS[number]
export type GravityMode = 'normal' | 'moon' | 'zero'
export const DOLL_LAYER = 0x0002
export const ROOM_LAYER = 0x0004
export const PROP_LAYER = 0x0008
export const FIXTURE_LAYER = 0x0010
export const MOVING_LAYERS = DOLL_LAYER | PROP_LAYER
export const STEP = 1000 / 60

export type Ammo = 'paint' | 'egg' | 'tomato' | 'plunger' | 'dart' | 'foam'
export type Paint = Extract<Ammo, 'paint' | 'egg' | 'tomato' | 'foam'>
export type Decal = Vector & { kind: Paint; color: string; size: number; seed: number; born: number }
export type Shot = { body: Body; previous: Vector; kind: Ammo; color: string; born: number; radius: number }
export type Attachment = { limb: Limb; offset: Vector; angle: number; kind: 'plunger' | 'dart'; wobble: number; angularSpeed: number }
export type Mount = { point: Vector; normal: Vector; edge: 'floor' | 'ceiling' | 'left' | 'right' }
export type Pad = { body: Body; mount: Mount; pulseUntil: number }
export type Bumper = { body: Body; pulseUntil: number }
export type Turret = { mount: Mount; angle: number; born: number; nextFire: number }
export type Glove = { from: Vector; to: Vector; point: Vector; angle: number; born: number; hit: boolean }
export type Ice = { body: Body; width: number; height: number; pose: Array<{ limb: Limb; offset: Vector; angle: number }> }
export type Shard = Vector & { vx: number; vy: number; size: number; angle: number; spin: number; age: number }
