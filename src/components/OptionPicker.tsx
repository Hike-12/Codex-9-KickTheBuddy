import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

type Option<T> = { value: T; label: string; color?: string }

export function OptionPicker<T extends string>({ label, value, options, onChange, children, id }: {
  label: string; value: T; options: readonly Option<T>[]; onChange: (value: T) => void; children?: ReactNode; id?: string
}) {
  const generatedId = useId()
  const menuId = id ?? generatedId
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value)

  useLayoutEffect(() => {
    const panel = menu.current
    const button = trigger.current
    if (!open || !panel || !button) return
    function position() {
      if (!panel || !button) return
      const rect = button.getBoundingClientRect()
      const edge = 8
      const gap = 8
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      const right = left + (viewport?.width ?? window.innerWidth)
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const width = Math.min(Math.max(rect.width, 168), right - left - 2 * edge)
      const below = bottom - rect.bottom - gap - edge
      const above = rect.top - top - gap - edge
      const useTop = below < panel.scrollHeight && above > below
      const height = Math.max(0, useTop ? above : below)
      panel.style.width = `${width}px`
      panel.style.maxHeight = `${height}px`
      panel.style.left = `${Math.max(left + edge, Math.min(rect.right - width, right - width - edge))}px`
      panel.style.top = `${useTop ? rect.top - gap - Math.min(panel.scrollHeight, height) : rect.bottom + gap}px`
    }
    position()
    panel.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    viewport?.addEventListener('resize', position)
    viewport?.addEventListener('scroll', position)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      viewport?.removeEventListener('resize', position)
      viewport?.removeEventListener('scroll', position)
    }
  }, [open])

  return <>
    <button ref={trigger} type="button" className="control choice-trigger" popoverTarget={menuId} aria-label={selected ? label + ': ' + selected.label : label}>
      {children ?? <><span>{selected?.label}</span><Icon name="chevron" size={15} /></>}
    </button>
    <div id={menuId} ref={menu} popover="auto" className="choice-menu" role="group" aria-label={label}
      onToggle={event => setOpen(event.currentTarget.matches(':popover-open'))}
      onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        const buttons = Array.from(event.currentTarget.querySelectorAll('button'))
        const index = buttons.findIndex(button => button === document.activeElement)
        const last = buttons.length - 1
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
          : Math.max(0, Math.min(last, index + (event.key === 'ArrowDown' ? 1 : -1)))
        event.preventDefault()
        buttons[next]?.focus()
      }}>
      {options.map(option => <button key={option.value} className="choice-option" type="button" aria-pressed={value === option.value}
        onClick={() => {
          onChange(option.value)
          menu.current?.hidePopover()
          trigger.current?.focus({ preventScroll: true })
        }}>
        {option.color && <span className="choice-swatch" style={{ backgroundColor: option.color }} />}
        {option.label}
        {option.value === value && <Icon name="check" size={15} />}
      </button>)}
    </div>
  </>
}
