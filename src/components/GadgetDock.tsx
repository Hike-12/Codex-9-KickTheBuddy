import { TOOLS } from '../engine/gadgetModel'
import type { Tool } from '../engine/gadgetModel'
import type { Hud } from '../engine/model'
import { Icon } from './Icon'
import type { ComponentProps } from 'react'

const TOOLS_UI = {
  grab: { icon: 'hand', label: 'Grab', name: 'Grab & Slam', hint: 'Drag to fling', touch: 'Drag to fling' },
  paint: { icon: 'paint', label: 'Blaster', name: 'Paintball & Egg Blaster', hint: 'Hold to spray paintballs, eggs and tomatoes', touch: 'Hold to spray paintballs, eggs and tomatoes' },
  suction: { icon: 'suction', label: 'Suction', name: 'Plunger & Suction-Dart Launcher', hint: 'Hold to fire plungers and suction darts', touch: 'Hold to fire plungers and suction darts' },
  impact: { icon: 'anvil', label: 'Impact', name: 'Boxing Glove & Anvil Drop', hint: 'Click to drop an anvil · Shift+click or right-click to punch', touch: 'Tap to drop an anvil or switch to the glove' },
  vortex: { icon: 'vortex', label: 'Vortex', name: 'Black Hole Vortex', hint: 'Hold to pull · Release to blast', touch: 'Hold to pull · Release to blast' },
  freeze: { icon: 'freeze', label: 'Freeze', name: 'Freeze Ray', hint: 'Hold over the doll to freeze it', touch: 'Hold over the doll to freeze it' },
  trampoline: { icon: 'trampoline', label: 'Trampoline', name: 'Place Trampoline', hint: 'Place on a floor or wall · Up to 2', touch: 'Place on a floor or wall · Up to 2' },
  turret: { icon: 'turret', label: 'Turret', name: 'Place Auto-Turret', hint: 'Mount on the ceiling or upper walls · Fires for 15s', touch: 'Mount on the ceiling or upper walls · Fires for 15s' },
} satisfies Record<Tool, { icon: ComponentProps<typeof Icon>['name']; label: string; name: string; hint: string; touch: string }>

export function GadgetDock({ tool, onSelect, hud, glove, onToggleGlove }: {
  tool: Tool; onSelect: (tool: Tool) => void; hud: Hud; glove: boolean; onToggleGlove: () => void
}) {
  const active = TOOLS_UI[tool]
  return (
    <div className="gadget-console">
      <div className="tool-context" id="play-instructions">
        {hud.frozen ? <span className="frozen-status"><Icon name="freeze" size={15} /> Frozen · Slam or drop an anvil to shatter</span> : <>
          <span className="tool-hint">{active.hint}</span>
          <span className="tool-hint-touch">{active.touch}</span>
        </>}
        {tool === 'grab' && <span className="pet-hint"><Icon name="heart" size={15} /> Hover to pet</span>}
        {tool === 'freeze' && !hud.frozen && <progress aria-label="Freeze progress" max={100} value={hud.freezeProgress} />}
        {tool === 'impact' && <button className="secondary-tool" type="button" aria-pressed={glove} aria-label="Use boxing glove for primary input" onClick={onToggleGlove}>
          {glove ? 'Glove' : 'Anvil'}
        </button>}
      </div>
      <div className="gadget-dock" role="group" aria-label="Gadget dock">
        {TOOLS.map((id, i) => {
          const item = TOOLS_UI[id]
          return <button key={id} type="button" className="gadget-button" aria-pressed={tool === id} aria-label={item.name}
            aria-keyshortcuts={String(i + 1)} title={item.name + ' (' + (i + 1) + ')'} onClick={() => onSelect(id)}>
            <Icon name={item.icon} size={18} /><span>{item.label}</span><kbd>{i + 1}</kbd>
          </button>
        })}
      </div>
    </div>
  )
}
