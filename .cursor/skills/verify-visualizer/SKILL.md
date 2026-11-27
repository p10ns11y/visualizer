---
name: verify-visualizer
description: "Drive the Visualizer web cockpit and Code Mode in a browser, plus the local-model harness. Use when a change touches the shared workspace, Build, pause, or the dual-mode shell and the behavior has to be shown on the real page."
---

# Verify Visualizer

The surface is the Vite preview of `@visualizer/web` at `http://127.0.0.1:4183/`. Visual Cockpit and Code Mode are one page and one in-memory workspace. The local-model harness is `pnpm test:local-model` and does not need the page. The headless MCP server is `pnpm --filter @visualizer/mcp start` and is not this preview. Chrome is launched through `puppeteer-core` from `CHROME_PATH` or `/usr/bin/google-chrome`. Two copies on port `4183` cannot run together; refuse to drive a preview this skill did not start.

## Launch

From the repo root, with no session file:

```sh
node scripts/verify-visualizer.mjs launch
```

Launch builds the web package, starts `vite preview` on `127.0.0.1:4183`, and opens a headless Chrome page. Ready means the shell `data-mode` is `cockpit`, `data-phase` is `idle`, the version label is `v0`, and the heading is `Visualizer`. A fresh profile starts from the sample workspace. Edits are stored in `localStorage` under `visualizer.workspace`. There is no database. The WebMCP strip shows `Local bridge` unless the browser exposes `modelContext`. The command writes `/tmp/verify-visualizer/session.json` with the preview pid, the Chrome pid, and the browser websocket. It leaves Chrome running and disconnects.

## Doctor

```sh
node scripts/verify-visualizer.mjs doctor
```

Doctor is read-only. It checks that both recorded pids are alive, that `GET` of the session URL returns 200, and that the HTML contains `Visualizer`. `"ok": true` means the instance is worth driving. It does not click, type, or rewrite the session file.

## Drive

Read `.cursor/skills/verify-visualizer/features/README.md` first. Recipes use accessible names from `apps/web/src/App.tsx`.

Shared page commands:

```sh
node scripts/verify-visualizer.mjs browser fill --role textbox --name "Statement for Freehand canvas sketching" --value "Verification stroke pinned to the canvas card."
node scripts/verify-visualizer.mjs browser draw --card card-canvas
node scripts/verify-visualizer.mjs browser reload
node scripts/verify-visualizer.mjs browser click --role button --name "Code Mode"
node scripts/verify-visualizer.mjs browser click --role button --name "Build"
node scripts/verify-visualizer.mjs browser click --role button --name "Stop"
node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/visual-cockpit-editing.txt
node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/visual-cockpit-editing.png
```

One-session proofs, each from its own fresh launch:

```sh
node scripts/verify-visualizer.mjs drive visual-cockpit-editing
```

```sh
node scripts/verify-visualizer.mjs drive freehand-canvas-sketch
```

The fill command pastes the whole value in one `input` event. The click on `Code Mode` uses `button[aria-label="Code Mode"]`. `Build` and `Stop` match the button's visible name. Do not call React state setters or a test-only route.

## Evidence

Proof is the text dump and the screenshot under `/opt/cursor/artifacts/verify-visualizer/`. The cockpit drive must show the pasted sentence and version `v2` in Code Mode. Capture the edit and the mode switch, not only a finished screenshot. The local-model proof is stdout saved as `/opt/cursor/artifacts/verify-visualizer/local-model-harness.json`. Mocks stay where the app already isolates them: the page router is Tier 1, and the harness uses the real loopback client.

## Cleanup

```sh
node scripts/verify-visualizer.mjs cleanup
```

Cleanup sends `SIGTERM` to the preview process group and the Chrome pid stored in the session file, then deletes only `/tmp/verify-visualizer/session.json`. It does not kill processes by name and does not remove `/opt/cursor/artifacts/verify-visualizer/`.

## Helpers

The only browser helper is `scripts/verify-visualizer.mjs`. Invoke it as shown in Launch, Doctor, Drive, and Cleanup. Feature recipes live in `.cursor/skills/verify-visualizer/features/`.

`pnpm test:mbt` regenerates railway paths and is not a browser session. Do not treat a green model-based run as proof that a screen was driven.

Keep the map honest with `/maintain-verification-skill` when screens or labels change.
