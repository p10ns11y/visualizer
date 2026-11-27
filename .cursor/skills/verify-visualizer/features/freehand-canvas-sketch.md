# Freehand canvas sketching

Freehand canvas sketching draws ink on the canvas plate, pins that stroke to the freehand problem card, and shows the same stroke in Code Mode after a reload.

## Sub-features

- `sketch-draw` commits one stroke on pointerup and raises `stateVersion` once.
- `sketch-reload` reads that stroke back from `localStorage` on the next load.
- `sketch-code` lists the stroke id under the freehand card and can clear it.
- `sketch-pause` pauses a working railway phase when the stroke is drawn, and keeps the ink.

## How to get to it (user POV)

- Open the preview. The header reads Visual Cockpit and the canvas plate shows `0 strokes pinned to Freehand canvas sketching`.
- Press and drag on the sketch surface named `Sketch surface for Freehand canvas sketching`.
- Release the pointer. The plate reads `1 stroke pinned to Freehand canvas sketching`.
- Reload the page. The stroke is still on the plate.
- Press `Code Mode`. The pinned-strokes list names the stroke and offers `Clear strokes for Freehand canvas sketching`.

## Driving it with verify-visualizer

Preconditions:

- `node scripts/verify-visualizer.mjs doctor` prints `"ok": true`.
- The shell `data-mode` is `cockpit`, `data-phase` is `idle`, `data-stroke-count` is `0`, and the version label is `v0`.
- The sketch surface `svg[data-sketch="card-canvas"]` is on the page.

- **Draw one stroke.** Run `node scripts/verify-visualizer.mjs browser draw --card card-canvas`. The shell `data-stroke-count` becomes `1` and the version label becomes `v1`.
- **Reload.** Run `node scripts/verify-visualizer.mjs browser reload`. The stroke count stays `1`.
- **Open Code Mode.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Code Mode"`. The shell `data-mode` becomes `code`, the version label becomes `v2`, and the page text includes `stroke-2` and `1 stroke pinned to Freehand canvas sketching`.
- **Proof.** Run `node scripts/verify-visualizer.mjs drive freehand-canvas-sketch` from a fresh launch when you want the draw, the reload, the toggle, and both proof files in one session. The text file and screenshot land in `/opt/cursor/artifacts/verify-visualizer/`.

## Gotchas

- The stroke commits on pointerup, not on each move. A click with no drag still stores two samples so the plate can paint a dot.
- The canvas plate is the only drawing surface in this step. Its strokes use card id `card-canvas`.
- `drive` expects to start from `v0` and zero strokes. Run it on a fresh launch. A reload in the same Chrome profile keeps `localStorage`, so a second draw without cleanup starts above `v0`.
- Clearing strokes is a human edit. During a working phase it pauses the run, the same way drawing does.
- `Build` during this recipe is a different feature. This drive does not press `Build`.
