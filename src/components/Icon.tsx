import type { ReactNode } from 'react'

const glyphs = {
  thread: <><path d="m3 21 6-6m.4-2.8L17.5 4a2.1 2.1 0 0 1 3 3l-8.2 8.1-3.8.9.9-3.8Z"/><path d="m16 8 2-2M3 17a4 4 0 1 1 5-5" /></>,
  coin: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="M12 9v6"/></>,
  bolt: <path d="m13 2-8 12h6l-1 8 9-12h-6l1-8Z" />,
  mood: <><circle cx="12" cy="12" r="9"/><path d="M8 14c1.7 2.5 6.3 2.5 8 0M9 9h.01M15 9h.01"/></>,
  portrait: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2.5"/><path d="M7 18c.5-3 2.3-4.5 5-4.5s4.5 1.5 5 4.5"/></>,
  reset: <><path d="M3 11a9 9 0 1 1 2.8 7M3 5v6h6"/></>,
  hand: <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-4-5a1.6 1.6 0 0 1 2.4-2.1L8 13Z" />,
  heart: <path d="M20.2 5.8a4.7 4.7 0 0 0-6.7 0L12 7.3l-1.5-1.5a4.7 4.7 0 0 0-6.7 6.7l8.2 8 8.2-8a4.7 4.7 0 0 0 0-6.7Z" />,
  box: <><path d="M3 9h18v11H3zM3 9l2.5-5h13L21 9M9 13h6"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3"/></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
} satisfies Record<string, ReactNode>

export function Icon({ name, size = 19 }: { name: keyof typeof glyphs; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{glyphs[name]}</svg>
}
