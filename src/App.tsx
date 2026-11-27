import { useEffect, useRef, useState } from 'react'
import { FaceCropModal } from './components/FaceCropModal'
import { Icon } from './components/Icon'
import { RagdollEngine } from './engine/RagdollEngine'
import { DEFAULT_PROFILE, INITIAL_HUD } from './engine/model'
import type { Profile } from './engine/model'

const PROFILE_KEY = 'jute-room:friend:v1'

function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return DEFAULT_PROFILE
    return {
      name: 'name' in data && typeof data.name === 'string' ? data.name.trim().slice(0, 24) || DEFAULT_PROFILE.name : DEFAULT_PROFILE.name,
      face: 'face' in data && typeof data.face === 'string' && /^data:image\/(webp|png);base64,/.test(data.face) ? data.face : null,
      roasts: 'roasts' in data && Array.isArray(data.roasts)
        ? data.roasts.filter((line: unknown): line is string => typeof line === 'string').map(line => line.trim().slice(0, 85)).filter(Boolean).slice(0, 8)
        : [],
      blend: !('blend' in data) || data.blend !== false,
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

export default function App() {
  const [profile, setProfile] = useState(readProfile)
  const initialProfile = useRef(profile)
  const [hud, setHud] = useState(INITIAL_HUD)
  const [editing, setEditing] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const coin = useRef<HTMLDivElement>(null)
  const engine = useRef<RagdollEngine | null>(null)
  const swap = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!canvas.current || !coin.current) return
    const room = new RagdollEngine(canvas.current, coin.current, initialProfile.current, setHud)
    engine.current = room
    return () => {
      room.destroy()
      engine.current = null
    }
  }, [])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'r' && !editing && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
        engine.current?.reset()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [editing])

  function closeCustomizer() {
    engine.current?.setPaused(false)
    setEditing(false)
    requestAnimationFrame(() => swap.current?.focus({ preventScroll: true }))
  }

  function saveProfile(value: Profile) {
    setProfile(value)
    engine.current?.setProfile(value)
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(value)) } catch { /* The current session still keeps the profile. */ }
    closeCustomizer()
  }

  return (
    <main className="playroom">
      <canvas ref={canvas} className="studio" aria-label="Interactive ragdoll studio" aria-describedby="play-instructions" tabIndex={0} />
      <header className="studio-bar">
        <div className="brand">
          <span className="brand-mark"><Icon name="thread" size={23} /></span>
          <h1>Jute Room</h1>
        </div>
        <div className="telemetry" aria-label="Game stats">
          <div ref={coin} className="stat stat-coin" aria-label={'Gold coins: ' + hud.coins}><Icon name="coin" /><strong>${hud.coins.toLocaleString()}</strong></div>
          <div className="stat stat-friend" title={profile.name}><span className="dot" /> <strong>{profile.name}</strong></div>
          <div className="stat stat-mood" aria-label={'Mood: ' + hud.mood}><Icon name="mood" /><span>{hud.mood}</span></div>
          <div className={'stat stat-combo' + (hud.combo ? ' is-live' : '')} aria-label={'Combo: ' + hud.combo}>
            <Icon name="bolt" size={17} /><strong>×{hud.combo}</strong>
            <span className="combo-track" aria-hidden="true" style={{ transform: 'scaleX(' + hud.comboTime + ')' }} />
          </div>
        </div>
        <div className="studio-actions">
          <button ref={swap} className="control" onClick={() => { engine.current?.setPaused(true); setEditing(true) }}>
            <Icon name="portrait" /> <span>Swap Face <span className="extra-label">/ Roasts</span></span>
          </button>
          <button className="control reset-btn" onClick={() => engine.current?.reset()} aria-keyshortcuts="R">
            <Icon name="reset" /> <span>Reset Doll</span><kbd>R</kbd>
          </button>
        </div>
      </header>
      <aside className="integrity" aria-label={'Integrity: ' + hud.integrity + '%'} data-low={hud.integrity < 30}>
        <div><span>Stitch integrity</span><strong>{hud.integrity}%</strong></div>
        <meter min={0} max={100} value={hud.integrity} aria-label="Stitch integrity" />
      </aside>
      <footer className="studio-footer">
        <div className="play-hints" id="play-instructions">
          <span><Icon name="hand" size={16} /> Drag to fling</span>
          <span className="pet-hint"><Icon name="heart" size={16} /> Hover to pet</span>
        </div>
        <div className="tools-dock" aria-label="Tool dock">
          <span className="tool-current"><Icon name="hand" size={18} /> Hands</span>
          <span className="tool-locked"><Icon name="lock" size={15} /> Gadget shelf</span>
        </div>
      </footer>
      {editing && <FaceCropModal profile={profile} onClose={closeCustomizer} onSave={saveProfile} />}
    </main>
  )
}
