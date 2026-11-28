# Flow screen

The page is one screen. Asking puts questions on the left and a preview on the right. It also shows the stage line and the event log. It does not scroll. The log starts empty. Settings holds the mode toggle. Advanced mode adds a later panel.

## Sub-features

- `open` shows the heading, `data-screen="flow"`, stage `asking`, view `asking`, mode `simple`, the question `What are you making?`, an empty preview, and an empty log.
- `still` confirms the document and the screen do not overflow the viewport.
- `drive` chooses SaaS and Users, then presses Start, Pause, Settings, Advanced, Close, and Stop. The preview and the gap cards change before Start, and that choice adds no log line. The stage and the view reach `done`, the mode is `advanced`, the later panel is present, and the log has those four events. Reset then returns to asking, live, and simple.

## How to get to it (user POV)

- From the repo root, run `pnpm --filter @visualizer/web build`, then `pnpm --filter @visualizer/web exec vite preview --host 127.0.0.1 --port 4183 --strictPort`.
- Open `http://127.0.0.1:4183/`.
- The heading reads Visualizer. The stage line reads `asking · simple`. The view asks `What are you making?`. The event log has no rows.
- Choose SaaS, then Users. The preview reads Workspace and the cards include Auth and Hosting. The log stays empty.
- Start moves the stage and the view to editing. Pause holds that stage. Settings opens the mode toggle. Advanced toggles the mode and shows the later panel. Stop reaches done. Reset returns to the start.

## Driving it with verify-visualizer

- **Launch.** `node scripts/verify-visualizer.mjs launch`. Ready means the heading is Visualizer, `data-screen` is `flow`, `data-stage` is `asking`, `data-view` is `asking`, and `data-scroll` is `false`.
- **Drive.** `node scripts/verify-visualizer.mjs drive flow`.
- **Proof.** `/opt/cursor/artifacts/verify-visualizer/flow.txt` and `flow.png`.

## Gotchas

- A second preview on port `4183` makes launch refuse. Run cleanup first.
- `pnpm test:mbt` does not open this page.
- An ignored click, such as Start after done, does not add a log line.
