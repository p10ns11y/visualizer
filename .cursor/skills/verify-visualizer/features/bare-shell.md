# Empty screen

The page is one empty screen with the heading Visualizer. It does not scroll.

## Sub-features

- `open` shows the heading and `data-screen="empty"`.
- `still` confirms the document and the screen do not overflow the viewport.

## How to get to it (user POV)

- From the repo root, run `pnpm --filter @visualizer/web build`, then `pnpm --filter @visualizer/web exec vite preview --host 127.0.0.1 --port 4183 --strictPort`.
- Open `http://127.0.0.1:4183/`.
- The heading reads Visualizer. There is no second region and no column.

## Driving it with verify-visualizer

- **Launch.** `node scripts/verify-visualizer.mjs launch`. Ready means the heading is Visualizer, `data-screen` is `empty`, and `data-scroll` is `false`.
- **Drive.** `node scripts/verify-visualizer.mjs drive bare-shell`.
- **Proof.** `/opt/cursor/artifacts/verify-visualizer/bare-shell.txt` and `bare-shell.png`.

## Gotchas

- A second preview on port `4183` makes launch refuse. Run cleanup first.
- `pnpm test:mbt` does not open this page.
