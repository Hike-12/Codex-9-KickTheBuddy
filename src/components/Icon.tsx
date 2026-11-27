import type { ReactNode } from 'react'

const glyphs = {
  thread: <><path d="m3 21 6-6m.4-2.8L17.5 4a2.1 2.1 0 0 1 3 3l-8.2 8.1-3.8.9.9-3.8Z"/><path d="m16 8 2-2M3 17a4 4 0 1 1 5-5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  mood: <><circle cx="12" cy="12" r="9"/><path d="M8 14c1.7 2.5 6.3 2.5 8 0M9 9h.01M15 9h.01"/></>,
  portrait: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2.5"/><path d="M7 18c.5-3 2.3-4.5 5-4.5s4.5 1.5 5 4.5"/></>,
  reset: <><path d="M3 11a9 9 0 1 1 2.8 7M3 5v6h6"/></>,
  hand: <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-4-5a1.6 1.6 0 0 1 2.4-2.1L8 13Z" />,
  heart: <path d="M20.2 5.8a4.7 4.7 0 0 0-6.7 0L12 7.3l-1.5-1.5a4.7 4.7 0 0 0-6.7 6.7l8.2 8 8.2-8a4.7 4.7 0 0 0 0-6.7Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
  paint: <><path d="M4 14c-2-2 0-5 3-5-1-3 2-5 4-3 2-5 7-3 6 1 4 0 5 4 2 6 3 3 0 7-3 6-1 3-6 3-7 0-3 1-6-1-5-5Z"/><circle cx="11" cy="12" r="2"/></>,
  suction: <><path d="m4 17 7-7m-3 9-4-4m5-4 2-5 2-2 7 7-2 2-5 2-4-4Z"/><path d="m12 5 8 8"/></>,
  anvil: <><path d="M3 7h18l-3 4-4 1v3l3 2v2H7v-2l3-2v-3l-4-1-3-4Z"/><path d="M4 7V5h16v2"/></>,
  vortex: <><circle cx="12" cy="12" r="2.5"/><path d="M3 13c-3-4 3-8 10-8m8 6c3 4-3 8-10 8M7 9c-1 1-2 3 0 5m10 1c2-2 2-4 0-5"/></>,
  freeze: <><path d="M12 2v20M4 7l16 10M4 17 20 7m-8-3L9 2m3 2 3-2m-3 18-3 2m3-2 3 2M6 8l-3 1m3-1V5m12 11 3-1m-3 1v3m0-11 3 1m-3-1V5M6 16l-3-1m3 1v3"/></>,
  trampoline: <><rect x="3" y="8" width="18" height="5" rx="2"/><path d="m7 13-2 6m12-6 2 6M12 6V3m-2 2 2-2 2 2"/></>,
  turret: <><path d="M4 19h16M7 19v-3h10v3M11 14l-3-3 8-6 3 4-8 5Z"/><path d="m18 5 3-2"/></>,
  gravity: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10m-3-3 3 3 3-3"/></>,
  quake: <path d="M2 12h5l2-6 4 12 3-6h6" />,
  bumpers: <><circle cx="6" cy="15" r="3"/><circle cx="18" cy="15" r="3"/><circle cx="12" cy="7" r="3"/></>,
  wash: <><path d="m8 8 4-5 4 5 1 5a5 5 0 1 1-10 0l1-5Z"/><path d="M20 4v4m-2-2h4M3 10v4m-2-2h4"/></>,
  sound: <><path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="M16 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11"/></>,
  mute: <><path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="m16 10 5 5m0-5-5 5"/></>,
  link: <><path d="M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2"/><path d="M14 11a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2"/></>,
  share: <><path d="M12 15V3m-4 4 4-4 4 4"/><path d="M8 10H5v11h14V10h-3"/></>,
  clip: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/></>,
} satisfies Record<string, ReactNode>

export function Icon({ name, size = 19 }: { name: keyof typeof glyphs; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{glyphs[name]}</svg>
}
