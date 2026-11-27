# Jute Room

Day 9 of 30 Days, 30 Projects. Jute Room is a browser ragdoll sandbox with a woodwork playroom, a stitched canvas doll, and an arsenal of slapstick gadgets.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
npx tsc --noEmit
npm run build
```

For Vercel, use the Vite preset. The build outputs a static site to `dist/`, with no server or environment variables required.

## Play

| Key | Tool or action |
| --- | --- |
| `1` | Drag a limb to fling it. Tap the doll on a touchscreen or move gently over it with a mouse to pet it. |
| `2` | Hold to fire paintballs, eggs, and tomatoes. Splatter sticks to the doll and the room. |
| `3` | Fire plungers and suction darts. The ten most recent attachments stay on the doll. |
| `4` | Choose Anvil Drop or Boxing Glove in the dock, then aim at the room. Right-click or Shift-click also punches on desktop. |
| `5` | Hold to orbit the doll and props around a vortex. Release for the shockwave. |
| `6` | Hold the beam over the doll to freeze it. Fling the ice block or hit it with an anvil to shatter it. |
| `7` | Mount up to two trampolines on the floor or walls. |
| `8` | Mount a laser-sighted turret on the ceiling or upper wall. It runs for 15 seconds. |
| `R` | Drop a fresh doll. |
| `C` | Wash the room, remove the gadgets, and reset room modifiers. |
| `H` | Hide or restore the HUD. |
| `?` | Open or close the controls popover. |

Swipe the gadget dock to reach every tool on a narrow screen. The room bar cycles Earth, Moon, and Zero-G gravity, starts a quake, and toggles pinball bumpers. Sound starts on the first pointer or key gesture. Mute silences both live playback and the recording.

## Personalize and share

- **Swap Face / Roasts** lets you pick a photo or use the front camera on supported devices. Drag to pan and pinch or use the zoom slider to frame the crop. Choose an outfit and write custom roasts. Saving keeps the profile in local browser storage.
- **Copy Dare Link** puts a compressed profile in the URL fragment. The link may contain a 128 × 128 face thumbnail. Longer links fall back to name, roasts, and outfit. Opening a dare applies its profile to the room without replacing the saved profile.
- **Record 5s Clip** exports the canvas and synthesized audio as WebM or MP4, depending on browser support. Select the countdown to cancel. Capture caps the canvas at about 0.36 megapixels to limit encoding load and restores the normal rendering resolution afterward.
- **Export Scorecard** creates a 1440 × 1840 PNG with integrity lost, best combo, collected coins, a triggered roast, and whether a doll was destroyed during the session. A doll reset keeps the session totals.
- On phones, find exports under **Share menu**. When file sharing is supported, tap **Share clip** or **Share report** once the export is ready to open the system share sheet. Other browsers download the file directly.

## Architecture

- React owns the controls and the friend editor. `RagdollEngine` owns the `requestAnimationFrame` loop, fixed 60 Hz Matter.js steps, pointer input, and throttled HUD snapshots.
- `GadgetSystem` owns projectiles, fixtures, environmental forces, and the ice body. Canvas renderers draw the room, clothes, decals, and effects from game state using cached textures and paint stamps.
- `GameDirector` tracks impacts, coins, dialogue, and report stats. It sends foley events to `CartoonAudio`, which schedules synthesis on the Web Audio clock.
- `dareShare` validates and serializes the share profile. `dareExport` handles capture, downloads, and poster drawing outside the simulation loop. Photos, recordings, and reports are processed in the browser.
