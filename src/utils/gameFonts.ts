export const DISPLAY_FONT = '"Fredoka", sans-serif'
export const SPEECH_FONT = '"Patrick Hand", cursive'
export const UI_FONT = '"Bricolage Grotesque", sans-serif'

let baseFonts: Promise<void> | undefined

export async function gameFontsReady(name: string, speech: string) {
  const { fonts } = document
  baseFonts ??= Promise.allSettled([
    fonts.load('700 37px ' + DISPLAY_FONT, 'BONK! CRITICAL! +$25 ×0123456789'),
    fonts.load('400 20px ' + SPEECH_FONT, "I'm literally made of jute"),
    fonts.load('700 14px ' + UI_FONT, '0123456789'),
  ]).then(() => {})

  await Promise.allSettled([
    baseFonts,
    fonts.load('700 45px ' + DISPLAY_FONT, name),
    fonts.load('400 20px ' + SPEECH_FONT, speech),
  ])
  await fonts.ready
}
