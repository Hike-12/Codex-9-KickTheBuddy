import { useEffect, useRef, useState } from 'react'
import { FaceCropModal } from './components/FaceCropModal'
import { GadgetDock } from './components/GadgetDock'
import { Icon } from './components/Icon'
import { RoomModifiersBar } from './components/RoomModifiersBar'
import { CONTROLS_POPOVER_ID, SHARE_POPOVER_ID, StudioExports } from './components/StudioExports'
import { CartoonAudio } from './engine/CartoonAudio'
import { RagdollEngine } from './engine/RagdollEngine'
import { TOOLS } from './engine/gadgetModel'
import type { GravityMode, Tool } from './engine/gadgetModel'
import { DEFAULT_PROFILE, INITIAL_HUD, profileFrom } from './engine/model'
import type { Profile } from './engine/model'
import { canRecordClip, canShareDare, createDareFile, createScorecard, downloadDare, recordDareClip, shareDare } from './utils/dareExport'
import type { DareExportKind } from './utils/dareExport'
import { copyDareLink, readDare } from './utils/dareShare'

const PROFILE_KEY = 'jute-room:friend:v1'

function DisplayDigits({ value }: { value: number }) {
  return [...String(value)].map((digit, index) => <span className="display-digit" key={index}>{digit}</span>)
}

function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const data: unknown = JSON.parse(raw)
    return profileFrom(data) ?? DEFAULT_PROFILE
  } catch {
    return DEFAULT_PROFILE
  }
}

export default function App() {
  const [profile, setProfile] = useState(() => window.location.hash.startsWith('#dare=') ? DEFAULT_PROFILE : readProfile())
  const initialProfile = useRef(profile)
  const [hud, setHud] = useState(INITIAL_HUD)
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<Tool>('grab')
  const [glove, setGlove] = useState(false)
  const [gravity, setGravity] = useState<GravityMode>('normal')
  const [bumpers, setBumpers] = useState(false)
  const [dareMode, setDareMode] = useState(false)
  const [hudHidden, setHudHidden] = useState(false)
  const [muted, setMuted] = useState(false)
  const [recording, setRecording] = useState<number | null>(null)
  const [recordSupported] = useState(() => canRecordClip() && typeof AudioContext !== 'undefined')
  const [copying, setCopying] = useState(false)
  const [makingPoster, setMakingPoster] = useState(false)
  const [ready, setReady] = useState<Partial<Record<DareExportKind, File>>>({})
  const [toast, setToast] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const coin = useRef<HTMLDivElement>(null)
  const engine = useRef<RagdollEngine | null>(null)
  const swap = useRef<HTMLButtonElement>(null)
  const audio = useRef<CartoonAudio | null>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const toastTimer = useRef(0)
  const clipInFlight = useRef<AbortController | null>(null)
  const focusFrame = useRef(0)

  useEffect(() => {
    if (!canvas.current || !coin.current) return
    const sound = new CartoonAudio()
    const life = new AbortController()
    const { signal } = life
    const room = new RagdollEngine(canvas.current, coin.current, initialProfile.current, setHud, sound.play)
    engine.current = room
    audio.current = sound
    lifecycle.current = life
    const unlock = (event: Event) => {
      if (event instanceof PointerEvent && event.type === 'pointerdown' && event.pointerType !== 'mouse') return
      if (event.isTrusted && !sound.ready) void sound.unlock()
    }
    window.addEventListener('pointerdown', unlock, { signal, capture: true })
    window.addEventListener('pointerup', unlock, { signal, capture: true })
    window.addEventListener('keydown', unlock, { signal, capture: true })
    let current = 0
    const hydrate = async () => {
      const id = ++current
      const hash = window.location.hash
      const dare = await readDare(hash)
      if (signal.aborted || id !== current) return
      const next = dare ?? (hash.startsWith('#dare=') ? DEFAULT_PROFILE : readProfile())
      setDareMode(Boolean(dare))
      setProfile(next)
      room.setProfile(next)
    }
    if (window.location.hash.startsWith('#dare=')) void hydrate()
    window.addEventListener('hashchange', () => { void hydrate() }, { signal })
    return () => {
      life.abort()
      clipInFlight.current?.abort()
      clipInFlight.current = null
      window.clearTimeout(toastTimer.current)
      cancelAnimationFrame(focusFrame.current)
      room.destroy()
      sound.destroy()
      engine.current = null
      audio.current = null
      lifecycle.current = null
    }
  }, [])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (editing || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey ||
        (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]'))) return
      const key = event.key.toLowerCase()
      if (key === 'r') engine.current?.reset()
      if (key === 'c') clearRoom()
      if (key === 'h') toggleHud()
      if (key === '?') document.getElementById(CONTROLS_POPOVER_ID)?.togglePopover?.()
      const selected = /^[1-8]$/.test(key) ? TOOLS[Number(key) - 1] : undefined
      if (selected) selectTool(selected)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [editing])

  function toggleHud() {
    document.getElementById(CONTROLS_POPOVER_ID)?.hidePopover?.()
    const shareMenu = document.getElementById(SHARE_POPOVER_ID)
    if (shareMenu?.hasAttribute('popover')) shareMenu.hidePopover?.()
    setHudHidden(hidden => !hidden)
  }

  function deliverExport(blob: Blob, name: string, kind: DareExportKind, signal: AbortSignal) {
    const file = createDareFile(blob, name, kind)
    const label = kind === 'clip' ? 'Clip' : 'Damage report'
    if (matchMedia('(any-pointer: coarse), (width < 640px)').matches && canShareDare(file)) {
      setReady(previous => ({ ...previous, [kind]: file }))
      announce(label + ' ready to share')
    } else {
      downloadDare(file, signal)
      announce(label + ' downloaded')
    }
  }

  async function shareExport(kind: DareExportKind) {
    const file = ready[kind]
    const signal = lifecycle.current?.signal
    if (!file || !signal) return
    const label = kind === 'clip' ? 'Clip' : 'Damage report'
    try {
      const result = await shareDare(file, signal)
      if (signal.aborted || result === 'canceled') return
      setReady(previous => previous[kind] === file ? { ...previous, [kind]: undefined } : previous)
      announce(label + (result === 'shared' ? ' shared' : ' downloaded'))
    } catch {
      if (!signal.aborted) announce(label + ' could not be saved')
    }
  }

  function announce(message: string) {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 3100)
  }

  async function copyDare() {
    const signal = lifecycle.current?.signal
    if (!signal || copying) return
    setCopying(true)
    try {
      const { photoOmitted } = await copyDareLink(profile)
      if (!signal.aborted) announce(photoOmitted ? 'Dare link copied without the photo' : 'Dare link copied')
    } catch {
      if (!signal.aborted) announce('Clipboard unavailable. Try again in a secure browser tab.')
    } finally {
      if (!signal.aborted) setCopying(false)
    }
  }

  async function record() {
    const signal = lifecycle.current?.signal
    const sound = audio.current
    const scene = canvas.current
    const room = engine.current
    if (!signal || !sound || !scene || !room || clipInFlight.current) return
    const clip = new AbortController()
    clipInFlight.current = clip
    setRecording(5)
    try {
      if (!await sound.unlock()) throw new Error('Studio sound could not start')
      if (signal.aborted || clip.signal.aborted) return
      const track = sound.recordingTrack()
      if (!track) throw new Error('The recording audio track is unavailable')
      room.setCapturing(true)
      const blob = await recordDareClip(scene, track, setRecording, clip.signal)
      if (!signal.aborted && !clip.signal.aborted) {
        deliverExport(blob, profile.name, 'clip', signal)
      }
    } catch {
      if (!signal.aborted && !clip.signal.aborted) announce('Couldn’t record this clip in this browser')
    } finally {
      if (clipInFlight.current === clip) {
        clipInFlight.current = null
        room.setCapturing(false)
        setRecording(null)
      }
    }
  }

  function cancelRecording() {
    const clip = clipInFlight.current
    if (!clip) return
    clipInFlight.current = null
    clip.abort()
    engine.current?.setCapturing(false)
    setRecording(null)
    announce('Recording canceled')
  }

  async function exportPoster() {
    const stats = engine.current?.scorecard()
    const signal = lifecycle.current?.signal
    if (!stats || !signal || makingPoster) return
    setMakingPoster(true)
    try {
      const poster = await createScorecard(profile, stats)
      if (!signal.aborted) {
        deliverExport(poster, profile.name, 'scorecard', signal)
      }
    } catch {
      if (!signal.aborted) announce('Couldn’t export the damage report')
    } finally {
      if (!signal.aborted) setMakingPoster(false)
    }
  }

  function selectTool(next: Tool) {
    setTool(next)
    engine.current?.setTool(next)
  }

  function clearRoom() {
    setGravity('normal')
    setBumpers(false)
    engine.current?.clearRoom()
  }

  function closeCustomizer() {
    engine.current?.setPaused(false)
    setEditing(false)
    cancelAnimationFrame(focusFrame.current)
    focusFrame.current = requestAnimationFrame(() => swap.current?.focus({ preventScroll: true }))
  }

  function saveProfile(value: Profile) {
    setProfile(value)
    engine.current?.setProfile(value)
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(value)) } catch { /* The current session still keeps the profile. */ }
    closeCustomizer()
  }

  return (
    <main className="playroom" data-hud-hidden={hudHidden} data-export-status={recording !== null || Boolean(ready.clip || ready.scorecard)}>
      <div className="stage-surface">
        <canvas ref={canvas} className="studio" aria-label="Interactive ragdoll studio" aria-describedby="play-instructions" tabIndex={0} />
      </div>
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
            <Icon name="bolt" size={17} /><strong>×<DisplayDigits value={hud.combo} /></strong>
            <span className="combo-track" aria-hidden="true" style={{ transform: 'scaleX(' + hud.comboTime + ')' }} />
          </div>
        </div>
        <div className="studio-actions">
          <button ref={swap} className="control" aria-label="Swap Face / Roasts" title="Swap Face / Roasts" onClick={() => { engine.current?.setPaused(true); setEditing(true) }}>
            <Icon name="portrait" /> <span>Swap Face <span className="extra-label">/ Roasts</span></span>
          </button>
          <button className="control reset-btn" aria-label="Reset Doll" title="Reset Doll" onClick={() => engine.current?.reset()} aria-keyshortcuts="R">
            <Icon name="reset" /> <span>Reset Doll</span><kbd>R</kbd>
          </button>
        </div>
      </header>
      <StudioExports muted={muted} recording={recording} canRecord={recordSupported} copying={copying} makingPoster={makingPoster}
        readyClip={Boolean(ready.clip)} readyPoster={Boolean(ready.scorecard)} onShare={kind => { void shareExport(kind) }}
        onMute={() => {
          audio.current?.setMuted(!muted)
          setMuted(!muted)
        }}
        onCopy={() => { void copyDare() }} onRecord={() => { void record() }} onCancel={cancelRecording}
        onPoster={() => { void exportPoster() }} onHide={toggleHud} />
      <RoomModifiersBar gravity={gravity} bumpers={bumpers} quake={hud.quake}
        onGravity={() => {
          const next = gravity === 'normal' ? 'moon' : gravity === 'moon' ? 'zero' : 'normal'
          setGravity(next)
          engine.current?.setGravity(next)
        }}
        onBumpers={() => {
          setBumpers(!bumpers)
          engine.current?.setBumpers(!bumpers)
        }}
        onQuake={() => engine.current?.quake()} onClear={clearRoom} />
      <aside className="integrity" aria-label={'Integrity: ' + hud.integrity + '%'} data-low={hud.integrity < 30}>
        <div><span>Stitch integrity</span><strong><DisplayDigits value={hud.integrity} />%</strong></div>
        <meter min={0} max={100} value={hud.integrity} aria-label="Stitch integrity" />
      </aside>
      {dareMode && <span className="dare-mode">Dare mode active</span>}
      <footer className="studio-footer">
        <GadgetDock tool={tool} onSelect={selectTool} hud={hud} glove={glove} onImpactMode={selected => {
          setGlove(selected)
          engine.current?.setGlovePrimary(selected)
        }} />
      </footer>
      {hudHidden && <button type="button" className="control show-hud" onClick={toggleHud} aria-keyshortcuts="H">Show HUD <kbd>H</kbd></button>}
      <div className="studio-toast" role="status">{toast}</div>
      {editing && <FaceCropModal profile={profile} onClose={closeCustomizer} onSave={saveProfile} />}
    </main>
  )
}
