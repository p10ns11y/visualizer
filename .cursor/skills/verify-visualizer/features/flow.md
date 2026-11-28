# Flow screen

The page is one screen. It shows the view for the current stage, the stage line, and the event log. It does not scroll. The log starts empty. Advanced mode adds a later panel.

## Sub-features

- `open` shows the heading, `data-screen="flow"`, stage `asking`, view `asking`, mode `simple`, the Questions placeholder, and an empty log.
- `still` confirms the document and the screen do not overflow the viewport.
- `drive` presses Start, Pause, Advanced, and Stop. The stage and the view end at `done`, the mode is `advanced`, the later panel is present, and the log has those four events.

## How to get to it (user POV)

- From the repo root, run `pnpm --filter @visualizer/web build`, then `pnpm --filter @visualizer/web exec vite preview --host 127.0.0.1 --port 4183 --strictPort`.
- Open `http://127.0.0.1:4183/`.
- The heading reads Visualizer. The stage line reads `asking · simple`. The view reads Questions. The event log has no rows.
- Start moves the stage and the view to editing. Pause holds that stage. Advanced toggles the mode and shows the later panel. Stop reaches done.

## Driving it with verify-visualizer

- **Launch.** `node scripts/verify-visualizer.mjs launch`. Ready means the heading is Visualizer, `data-screen` is `flow`, `data-stage` is `asking`, `data-view` is `asking`, and `data-scroll` is `false`.
- **Drive.** `node scripts/verify-visualizer.mjs drive flow`.
- **Proof.** `/opt/cursor/artifacts/verify-visualizer/flow.txt` and `flow.png`.

## Gotchas

- A second preview on port `4183` makes launch refuse. Run cleanup first.
- `pnpm test:mbt` does not open this page.
- An ignored click, such as Start after done, does not add a log line.
