export const DISPLAY_FONT = '"Fredoka", sans-serif'
export const SPEECH_FONT = '"Patrick Hand", cursive'

let baseFonts: Promise<void> | undefined

export async function gameFontsReady(speech: string) {
  const { fonts } = document
  baseFonts ??= Promise.allSettled([
    fonts.load('700 37px ' + DISPLAY_FONT, 'BONK! CRITICAL!'),
    fonts.load('400 20px ' + SPEECH_FONT, "I'm literally made of jute"),
  ]).then(() => {})

  await Promise.allSettled([
    baseFonts,
    fonts.load('400 20px ' + SPEECH_FONT, speech),
  ])
  await fonts.ready
}
