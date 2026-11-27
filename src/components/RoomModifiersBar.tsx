import type { GravityMode } from '../engine/gadgetModel'
import { Icon } from './Icon'

const GRAVITY_LABEL = { normal: 'Earth', moon: 'Moon', zero: 'Zero-G' } satisfies Record<GravityMode, string>

export function RoomModifiersBar({ gravity, bumpers, quake, onGravity, onBumpers, onQuake, onClear }: {
  gravity: GravityMode; bumpers: boolean; quake: boolean
  onGravity: () => void; onBumpers: () => void; onQuake: () => void; onClear: () => void
}) {
  return (
    <div className="room-modifiers" role="group" aria-label="Room modifiers">
      <button type="button" className="room-pill" data-active={gravity !== 'normal'} onClick={onGravity}
        aria-label={'Gravity: ' + GRAVITY_LABEL[gravity] + '. Click to cycle Earth, Moon and Zero-G.'} title="Cycle Earth, Moon and Zero-G">
        <Icon name="gravity" size={16} />{GRAVITY_LABEL[gravity]}
      </button>
      <button type="button" className="room-pill" data-active={quake} onClick={onQuake} title="Shake the room for 2.5 seconds">
        <Icon name="quake" size={16} />Quake
      </button>
      <button type="button" className="room-pill" data-active={bumpers} aria-pressed={bumpers} onClick={onBumpers} aria-label="Pinball bumpers">
        <Icon name="bumpers" size={16} />Pinball
      </button>
      <button type="button" className="room-pill wash-pill" onClick={onClear} aria-keyshortcuts="C" aria-label="Wash and clear room">
        <Icon name="wash" size={16} /><span>Wash<span className="wash-extra"> &amp; Clear</span></span> <kbd>C</kbd>
      </button>
    </div>
  )
}
