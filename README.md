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

For Vercel, use the Vite preset. The game builds to `dist/`. Short dare links use the `/api/dare` function and a connected private Vercel Blob store. For local short-link testing, connect the store to a development environment and run `vercel dev`.

Vercel Web Analytics starts after the first interaction with Buddy or a tool used on the canvas. Its visitor count measures play starts and omits visits that never interact. Dare codes and query parameters are removed from the reported page URL.

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

Click **Integrity** to choose **Soft**, **Reinforced**, or **Unbreakable**. Reinforced is the default. Unbreakable keeps the hit reactions and prevents wear from taking the doll apart.

## Personalize and share

- **Swap Face / Roasts** lets you pick a photo or use the front camera on supported devices. Drag to pan and pinch or use the zoom slider to frame the crop. Choose an outfit and write custom roasts. Enable **Use custom roasts only** to show just your lines. An empty list in this mode keeps Buddy quiet. Saving keeps the profile in local browser storage.
- **Copy Dare Link** saves a snapshot of the friend profile, including the cropped photo, outfit, and custom roasts, and copies a short URL. Anyone with the link can load that snapshot. Older dare links still open, and opening a dare leaves the saved local profile intact.
- Face uploads accept up to 8 MB and 25 megapixels, with a maximum of 8,192 pixels on either edge. New shared portraits are at most 320 × 320 and 80 KiB. The API accepts at most 112 KiB per share request.
- **Record 5s Clip** exports the canvas and synthesized audio as WebM or MP4, depending on browser support. Select the countdown to cancel. Capture caps the canvas at about 0.36 megapixels to limit encoding load and restores the normal rendering resolution afterward.
- On phones, find exports under **Share menu**. When file sharing is supported, tap **Share clip** once the recording is ready to open the system share sheet. Other browsers download the file directly.

## Architecture

- React owns the controls and the friend editor. `RagdollEngine` owns the `requestAnimationFrame` loop, fixed 60 Hz Matter.js steps, pointer input, and throttled HUD snapshots.
- `GadgetSystem` owns projectiles, fixtures, environmental forces, and the ice body. Canvas renderers draw the room, clothes, decals, and effects from game state using cached textures and paint stamps.
- `GameDirector` tracks impacts, doll wear, and dialogue. It sends foley events to `CartoonAudio`, which schedules synthesis on the Web Audio clock.
- `dareShare` loads profiles from short links and older URL fragments. The `/api/dare` function validates and stores shared snapshots. `dareExport` handles clip capture and downloads outside the simulation loop.
