# Visualizer verification map

This directory is the maintained source for opening Visualizer the way a person does. Read the index, then follow the feature file. The harness is `node scripts/verify-visualizer.mjs`.

## Baseline preconditions

- The repo root is the current directory.
- Chrome is available at `CHROME_PATH` or `/usr/bin/google-chrome`.
- No session file exists at `/tmp/verify-visualizer/session.json`. Run `node scripts/verify-visualizer.mjs cleanup` if a previous run stopped halfway.
- Launch builds `@visualizer/web` and serves it at `http://127.0.0.1:4183/`. The page is one empty screen. The heading is `Visualizer`.
- Run `node scripts/verify-visualizer.mjs doctor` and require `ok: true` before driving.
- Never drive a preview this session did not start.

## Driving conventions

- Start from a fresh launch.
- The only accessible name on the page is the heading `Visualizer`.
- `drive bare-shell` reads that heading, checks that the page does not scroll, and writes proof files.
- Cleanup kills the preview pid and the Chrome pid recorded in the session file. It leaves `/opt/cursor/artifacts/verify-visualizer/`.

## Proof and skip reporting

- UI proof is the text dump and the screenshot written under `/opt/cursor/artifacts/verify-visualizer/`.
- The text dump must show `Visualizer` and no second screen.
- Record the feature id with the artifact.

## Feature entry contract

Each feature file has an H1, one opening paragraph, and these H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-visualizer`, `Gotchas`.

## Features

- [Empty screen](./bare-shell.md) opens the page and checks that it does not scroll.
