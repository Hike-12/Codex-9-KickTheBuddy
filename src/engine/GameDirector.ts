import type { Vector } from 'matter-js'
import { clamp, INITIAL_HUD } from './model'
import type { Expression, Hud, Profile, Room } from './model'

const COMBO_MS = 1400
const ROASTS = {
  grab: ['Bro chill', 'We could talk this out.'],
  slam: ['My lawyer will hear about this', 'Okay okay truce!'],
  combo: ['Is that all you got?', 'I am formally calling a pause.'],
  idle: ["I'm literally made of jute", 'Can we just hang out?'],
}

type ParticleKind = 'cotton' | 'confetti' | 'heart' | 'coin' | 'spark'
type Particle = {
  kind: ParticleKind
  x: number; y: number; vx: number; vy: number
  size: number; age: number; life: number; spin: number; color: string; value: number
}
type Callout = { text: string; x: number; y: number; age: number; accent: boolean }

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
  private comboUntil = 0
  private lastPet = -1000
  private petCount = 0
  private lastAction = 0
  private lastImpact = -1000
  private lineIndex = 0

  constructor(private profile: Profile) {}

  setProfile(profile: Profile) {
    this.profile = profile
  }

  private speak(reason: keyof typeof ROASTS) {
    const choices = this.profile.roasts.length > 0 && this.lineIndex % 2 === 1
      ? this.profile.roasts
      : ROASTS[reason]
    this.speech = { text: choices[this.lineIndex % choices.length] ?? ROASTS[reason][0] ?? '', until: this.now + 2250 }
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
    this.burst('heart', point, 2)
    if (++this.petCount % 4 === 0) {
      this.coins(point, 3, 1)
      this.callouts.push({ text: '+$3', x: point.x, y: point.y - 12, age: 0, accent: true })
    }
  }

  impact(point: Vector, speed: number, direction: Vector) {
    if (speed < 4 || this.now - this.lastImpact < 100 || this.respawnAt) return false
    this.lastImpact = this.now
    this.lastAction = this.now
    const heavy = speed >= 11
    const critical = speed >= 23
    this.hud.combo = this.now < this.comboUntil ? this.hud.combo + 1 : 1
    this.comboUntil = this.now + COMBO_MS
    const damage = Math.round(clamp(speed * 1.25 - 2, 2, 41))
    this.hud.integrity = Math.max(0, this.hud.integrity - damage)
    this.hud.mood = critical ? 'Dizzy' : 'Rattled'
    this.expression = {
      kind: critical ? (this.hud.combo % 2 ? 'stars' : 'spirals') : heavy ? 'shock' : 'sweat',
      until: this.now + (heavy ? 1150 : 670),
    }
    const value = (critical ? 25 : 5) * Math.min(4, Math.max(1, Math.ceil(this.hud.combo / 3)))
    this.coins(point, value, critical ? 5 : 3)
    this.burst('spark', point, heavy ? 11 : 5)
    this.callouts.push({ text: '+$' + value, x: point.x + 18, y: point.y + 15, age: 0, accent: true })
    if (this.hud.combo >= 3) {
      this.callouts.push({ text: 'x' + this.hud.combo + ' COMBO', x: point.x, y: point.y - 49, age: 0, accent: true })
    }
    if (heavy) {
      this.freezeUntil = this.now + clamp(35 + (speed - 11) * 1.8, 35, 60)
      this.shake = { ...direction, until: this.now + 230, strength: clamp(speed * 0.42, 5, 16) }
      this.burst('cotton', point, critical ? 14 : 6)
      this.callouts.push({
        text: critical ? 'CRITICAL!' : (['BONK!', 'OOF!', 'SLAM!'][this.hud.combo % 3] ?? 'BONK!'),
        x: point.x, y: point.y - 14, age: 0, accent: false,
      })
      this.speak(this.hud.combo >= 3 ? 'combo' : 'slam')
    }
    return heavy
  }

  pop(point: Vector) {
    this.burst('cotton', point, 54)
    this.burst('confetti', point, 34)
    this.callouts.push({ text: 'POP!', x: point.x, y: point.y - 36, age: 0, accent: false })
    this.speech = null
    this.respawnAt = this.now + 710
  }

  reset(clearEffects: boolean) {
    this.hud = { ...INITIAL_HUD, coins: this.hud.coins }
    this.comboUntil = 0
    this.freezeUntil = 0
    this.respawnAt = 0
    this.speech = null
    this.expression = null
    this.lastAction = this.now
    this.lastImpact = this.now + 450
    this.lastPet = this.now - 200
    this.petCount = 0
    this.shake.until = 0
    if (clearEffects) {
      for (const particle of this.particles) this.hud.coins += particle.value
      this.particles = []
      this.callouts = []
    }
  }

  advance(dt: number, room: Room, target: Vector) {
    this.now += dt
    this.hud.comboTime = clamp((this.comboUntil - this.now) / COMBO_MS, 0, 1)
    if (!this.hud.comboTime) this.hud.combo = 0
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
      if (p.kind === 'coin' && p.age > 530) {
        const ease = 1 - Math.exp(-dt / 115)
        p.x += (target.x - p.x) * ease
        p.y += (target.y - p.y) * ease
        if (Math.hypot(target.x - p.x, target.y - p.y) < 9) p.age = p.life
      } else {
        p.x += p.vx * step
        p.y += p.vy * step
        p.vy += (p.kind === 'heart' ? -0.012 : p.kind === 'cotton' ? 0.075 : 0.23) * step
        if (p.y > room.floor && p.vy > 0) {
          p.y = room.floor
          p.vy *= -0.53
          p.vx *= 0.83
        }
        if (p.kind === 'coin' && (p.x < room.left || p.x > room.right)) {
          p.x = clamp(p.x, room.left, room.right)
          p.vx *= -0.65
        }
      }
      if (p.age >= p.life) {
        this.hud.coins += p.value
        this.particles.splice(i, 1)
      }
    }
    for (const callout of this.callouts) callout.age += dt
    while ((this.callouts[0]?.age ?? 0) > 880) this.callouts.shift()
  }

  private coins(point: Vector, value: number, count: number) {
    this.burst('coin', point, count, value)
  }

  private burst(kind: ParticleKind, point: Vector, count: number, value = 0) {
    const colors = ['#eeb752', '#a5bf9a', '#d98265', '#fff1ce']
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 180) {
        const expired = this.particles.shift()
        this.hud.coins += expired?.value ?? 0
      }
      const spread = kind === 'heart' ? 1.8 : kind === 'cotton' ? 11 : 14
      this.particles.push({
        kind, x: point.x, y: point.y,
        vx: (Math.random() - 0.5) * spread, vy: -(1 + Math.random() * spread * 0.6),
        size: kind === 'coin' ? 7 : kind === 'cotton' ? 5 + Math.random() * 10 : 4 + Math.random() * 6,
        age: 0, life: kind === 'coin' ? 1400 : kind === 'spark' ? 390 : 640 + Math.random() * 540,
        spin: Math.random() * Math.PI * 2, color: colors[i % colors.length] ?? '#fff1ce',
        value: i === 0 ? value : 0,
      })
    }
  }
}
