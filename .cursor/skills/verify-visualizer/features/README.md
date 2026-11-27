# Visualizer verification map

This directory is the maintained source for driving Visualizer the way a person does. Read the index, then follow one feature file. The harness is `node scripts/verify-visualizer.mjs`.

## Baseline preconditions

- The repo root is the current directory.
- Chrome is available at `CHROME_PATH` or `/usr/bin/google-chrome`.
- No session file exists at `/tmp/verify-visualizer/session.json`. Run `node scripts/verify-visualizer.mjs cleanup` if a previous run stopped halfway.
- Launch builds `@visualizer/web` and serves it at `http://127.0.0.1:4183/`. The page starts as Visual Cockpit, phase `idle`, version `v0`.
- Run `node scripts/verify-visualizer.mjs doctor` and require `ok: true` before driving.
- Never drive a preview this session did not start. Port `4173` may belong to another preview.

## Driving conventions

- Start every recipe from the fresh cockpit unless its preconditions say otherwise.
- Prefer accessible names already in the app: `Code Mode`, `Build`, `Stop`, `Resume`, and `Statement for <card title>`.
- Browser commands share one page. A new browser would reset the in-memory workspace.
- `drive visual-cockpit-editing` runs the cockpit-edit recipe in that shared page and writes proof files.
- Cleanup kills the preview pid and the Chrome pid recorded in the session file. It leaves `/opt/cursor/artifacts/verify-visualizer/`.

## Proof and skip reporting

- Capture the action and the resulting state, not only the last screen.
- UI proof is the text dump and the screenshot written under `/opt/cursor/artifacts/verify-visualizer/`.
- The text dump must show the edited statement and `v2` after the cockpit edit and the Code Mode toggle.
- Record the feature id with the artifact. This harness drives `visual-cockpit-editing` as one session. The other feature files are the map for later runs; do not mark them verified because this one passed.
- Report an unreachable control with the command that failed and the missing label.

## Feature entry contract

Each feature file has an H1, one opening paragraph, and these H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-visualizer`, `Gotchas`.

## Features

- [Freehand canvas sketching](./freehand-canvas-sketch.md) draws a stroke on the canvas plate, reloads it, and reads the pin in Code Mode.
- [Memory panel](./memory-panel.md) promotes a confirmed Ensembly record and reads the lesson in Code Mode.
- [Visual Cockpit editing](./visual-cockpit-editing.md) edits a problem statement and reads it from Code Mode.
- [Code Mode parity](./code-mode-parity.md) opens Code Mode and confirms the shared version.
- [Pilot railway Build and human pause](./pilot-railway-build-pause.md) starts Build and pauses it from the banner.
- [Tier fallback and the local-model harness](./tier-fallback-local-model.md) runs the offline judgement harness.
