# Visualizer verification map

This directory is the maintained source for opening Visualizer the way a person does. Read the index, then follow the feature file. The harness is `node scripts/verify-visualizer.mjs`.

## Baseline preconditions

- The repo root is the current directory.
- Chrome is available at `CHROME_PATH` or `/usr/bin/google-chrome`.
- No session file exists at `/tmp/verify-visualizer/session.json`. Run `node scripts/verify-visualizer.mjs cleanup` if a previous run stopped halfway.
- Launch builds `@visualizer/web` and serves it at `http://127.0.0.1:4183/`. The page is one screen. The heading is `Visualizer`. The stage starts at `asking`.
- Run `node scripts/verify-visualizer.mjs doctor` and require `ok: true` before driving.
- Never drive a preview this session did not start.

## Driving conventions

- Start from a fresh launch.
- The accessible names are the heading `Visualizer`, the stage line, Start, Pause, Stop, Advanced, and the event log.
- `drive flow` presses Start, Pause, Advanced, and Stop, then writes proof files.
- Cleanup kills the preview pid and the Chrome pid recorded in the session file. It leaves `/opt/cursor/artifacts/verify-visualizer/`.

## Proof and skip reporting

- UI proof is the text dump and the screenshot written under `/opt/cursor/artifacts/verify-visualizer/`.
- The text dump must show `Visualizer`, the stage, and the event log on one screen.
- Record the feature id with the artifact.

## Feature entry contract

Each feature file has an H1, one opening paragraph, and these H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-visualizer`, `Gotchas`.

## Features

- [Flow screen](./flow.md) opens the page, presses Start, Pause, Advanced, and Stop, and checks that the page does not scroll.
