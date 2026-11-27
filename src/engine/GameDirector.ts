import type { Vector } from 'matter-js'
import type { Foley } from './CartoonAudio'
import { clamp, DEFAULT_HARDNESS, HARDNESS, INITIAL_HUD } from './model'
import type { Expression, Hardness, Hud, Profile } from './model'

const ROASTS = {
  grab: ['Bro chill', 'We could talk this out.'],
  slam: ['My lawyer will hear about this', 'Okay okay truce!'],
  idle: ["I'm literally made of jute", 'Can we just hang out?'],
}
const FULL_INTEGRITY = INITIAL_HUD.integrity * 100

type ParticleKind = 'cotton' | 'confetti' | 'heart' | 'spark'
type Particle = {
  kind: ParticleKind
  x: number; y: number; vx: number; vy: number
  size: number; age: number; life: number; spin: number; color: string
}
type Callout = { text: string; x: number; y: number; age: number }

export class GameDirector {
  hud: Hud = { ...INITIAL_HUD }
  particles: Particle[] = []
  callouts: Callout[] = []
  speech: { text: string; until: number } | null = null
  expression: { kind: Expression; until: number } | null = null
  now = 0
  freezeUntil = 0
  respawnAt = 0
  shake = { x: 0, y: 0, until: 0, strength: 0 }
  hardness: Hardness = DEFAULT_HARDNESS
  private remainingIntegrity = FULL_INTEGRITY
  private lastPet = -1000
  private lastAction = 0
  private lastImpact = -1000
  private lineIndex = 0
  private heavyHits = 0

  constructor(private profile: Profile, readonly sound: (event: Foley) => void) {}

  setProfile(profile: Profile) {
    this.profile = profile
    this.speech = null
    this.lineIndex = 0
  }

  private speak(reason: keyof typeof ROASTS) {
    const choices = this.profile.customRoasts ? this.profile.roasts : ROASTS[reason]
    if (!choices.length) return
    const text = choices[this.lineIndex % choices.length]
    if (!text) return
    this.speech = { text, until: this.now + 2250 }
    this.lineIndex++
  }

  grab() {
    this.lastAction = this.now
    this.speak('grab')
  }

  pet(point: Vector) {
    if (this.now - this.lastPet < 155) return
    this.lastPet = this.now
    this.lastAction = this.now
    this.hud.mood = 'Happy'
    this.sound({ kind: 'pet' })
    this.burst('heart', point, 2)
  }

  impact(point: Vector, speed: number, direction: Vector, damageScale = 1) {
    if (speed < 4 || this.now - this.lastImpact < 100 || this.respawnAt) return false
    this.lastImpact = this.now
    this.lastAction = this.now
    const heavy = speed >= 11
    const critical = speed >= 23
    const damage = Math.round(clamp(speed * 1.25 - 2, 2, 41) * damageScale)
    this.remainingIntegrity = Math.max(0, this.remainingIntegrity - damage * HARDNESS[this.hardness].wearPercent)
    this.hud.integrity = Math.ceil(this.remainingIntegrity / 100)
    if (damageScale >= 0.5) this.sound({ kind: 'impact', speed })
    this.hud.mood = critical ? 'Dizzy' : 'Rattled'
    if (heavy) this.heavyHits++
    this.expression = {
      kind: critical ? (this.heavyHits % 2 ? 'stars' : 'spirals') : heavy ? 'shock' : 'sweat',
      until: this.now + (heavy ? 1150 : 670),
    }
    this.burst('spark', point, heavy ? 11 : 5)
    if (heavy) {
      this.freezeUntil = this.now + clamp(35 + (speed - 11) * 1.8, 35, 60)
      this.shake = { ...direction, until: this.now + 230, strength: clamp(speed * 0.42, 5, 16) }
      this.burst('cotton', point, critical ? 14 : 6)
      this.addCallout({
        text: critical ? 'CRITICAL!' : (['BONK!', 'OOF!', 'SLAM!'][this.heavyHits % 3] ?? 'BONK!'),
        x: point.x, y: point.y - 14, age: 0,
      })
      this.speak('slam')
    }
    return heavy
  }

  rattle(direction: Vector, strength: number) {
    this.shake = { ...direction, until: this.now + 230, strength }
  }

  pop(point: Vector) {
    this.burst('cotton', point, 54)
    this.burst('confetti', point, 34)
    this.addCallout({ text: 'POP!', x: point.x, y: point.y - 36, age: 0 })
    this.speech = null
    this.respawnAt = this.now + 710
  }

  reset(clearEffects: boolean) {
    this.hud = { ...INITIAL_HUD }
    this.remainingIntegrity = FULL_INTEGRITY
    this.heavyHits = 0
    this.freezeUntil = 0
    this.respawnAt = 0
    this.speech = null
    this.expression = null
    this.lastAction = this.now
    this.lastImpact = this.now + 450
    this.lastPet = this.now - 200
    this.shake.until = 0
    if (clearEffects) {
      this.particles = []
      this.callouts = []
    }
  }

  advance(dt: number, floor: number) {
    this.now += dt
    if (this.speech && this.now >= this.speech.until) this.speech = null
    if (this.expression && this.now >= this.expression.until) this.expression = null
    if (!this.respawnAt && this.now - this.lastAction > 6500) {
      this.lastAction = this.now
      this.hud.mood = 'Curious'
      this.speak('idle')
    }

    const step = dt / (1000 / 60)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      if (!p) continue
      p.age += dt
      p.x += p.vx * step
      p.y += p.vy * step
      p.vy += (p.kind === 'heart' ? -0.012 : p.kind === 'cotton' ? 0.075 : 0.23) * step
      if (p.y > floor && p.vy > 0) {
        p.y = floor
        p.vy *= -0.53
        p.vx *= 0.83
      }
      if (p.age >= p.life) this.particles.splice(i, 1)
    }
    for (const callout of this.callouts) callout.age += dt
    while ((this.callouts[0]?.age ?? 0) > 880) this.callouts.shift()
  }

  private addCallout(callout: Callout) {
    if (this.callouts.length >= 48) this.callouts.shift()
    this.callouts.push(callout)
  }

  private burst(kind: ParticleKind, point: Vector, count: number) {
    const colors = ['#eeb752', '#a5bf9a', '#d98265', '#fff1ce']
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 180) this.particles.shift()
      const spread = kind === 'heart' ? 1.8 : kind === 'cotton' ? 11 : 14
      this.particles.push({
        kind, x: point.x, y: point.y,
        vx: (Math.random() - 0.5) * spread, vy: -(1 + Math.random() * spread * 0.6),
        size: kind === 'cotton' ? 5 + Math.random() * 10 : 4 + Math.random() * 6,
        age: 0, life: kind === 'spark' ? 390 : 640 + Math.random() * 540,
        spin: Math.random() * Math.PI * 2, color: colors[i % colors.length] ?? '#fff1ce',
      })
    }
  }
}
