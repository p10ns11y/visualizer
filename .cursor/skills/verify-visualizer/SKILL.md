---
name: verify-visualizer
description: "Open the Visualizer empty screen in a browser. Use when a change touches that screen and the page has to be shown."
---

# Verify Visualizer

The surface is the Vite preview of `@visualizer/web` at `http://127.0.0.1:4183/`. The page is one empty screen. Chrome is launched through `puppeteer-core` from `CHROME_PATH` or `/usr/bin/google-chrome`. Two copies on port `4183` cannot run together; refuse to drive a preview this skill did not start.

## Launch

From the repo root, with no session file:

```sh
node scripts/verify-visualizer.mjs launch
```

Launch builds the web package, starts `vite preview` on `127.0.0.1:4183`, and opens a headless Chrome page. Ready means the heading is `Visualizer`, `data-screen` is `empty`, `data-scroll` is `false`, and the page does not scroll. The command writes `/tmp/verify-visualizer/session.json` with the preview pid, the Chrome pid, and the browser websocket. It leaves Chrome running and disconnects.

## Doctor

```sh
node scripts/verify-visualizer.mjs doctor
```

Doctor is read-only. It checks that both recorded pids are alive, that `GET` of the session URL returns 200, and that the HTML contains `Visualizer`. `"ok": true` means the instance is worth driving. It does not click, type, or rewrite the session file.

## Drive

Read `.cursor/skills/verify-visualizer/features/README.md` first. The screen has one heading, `Visualizer`.

```sh
node scripts/verify-visualizer.mjs drive bare-shell
```

```sh
node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/bare-shell.txt
node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/bare-shell.png
```

Do not call React state setters or a test-only route.

## Evidence

Proof is the text dump and the screenshot under `/opt/cursor/artifacts/verify-visualizer/`. The text dump shows `Visualizer` and nothing else on the screen. Capture the open page, not a second view.

`pnpm test:mbt` regenerates railway paths and is not a browser session. Do not treat a green model-based run as proof that the screen was opened.

Keep the map honest with `/maintain-verification-skill` when the screen or its labels change.

## Cleanup

```sh
node scripts/verify-visualizer.mjs cleanup
```

Cleanup sends `SIGTERM` to the preview process group and the Chrome pid stored in the session file, then deletes only `/tmp/verify-visualizer/session.json`. It does not kill processes by name and does not remove `/opt/cursor/artifacts/verify-visualizer/`.

## Helpers

The only browser helper is `scripts/verify-visualizer.mjs`. Invoke it as shown in Launch, Doctor, Drive, and Cleanup. The feature recipe lives in `.cursor/skills/verify-visualizer/features/`.
