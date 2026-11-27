# Memory panel

The Memory panel lists Pulse Memory, the Canon 1 sparse inject, the Ensembly ledger, and workflow lessons in Visual Cockpit and in Code Mode. A confirmed ledger row can be promoted. The inject is labeled `pulse-pack-v1`. The same lists survive a reload. A workflow lesson recorded during a working phase leaves that phase running.

## Sub-features

- `memory-seed` shows the seeded rule in Pulse Memory and the unconfirmed decision on the ledger.
- `memory-promote` promotes `ens-mistake-stale-tick` and raises `stateVersion` once.
- `memory-code` shows the promoted row and the planning lesson after Code Mode opens.
- `memory-reload` reads the promoted row back from `localStorage`.

## How to get to it (user POV)

- Open the preview. The header reads Visual Cockpit. The Memory panel reads `Ledger 3 · Pulse 1 · Lessons 1` and shows `pulse-pack-v1` on the sparse inject.
- Read the Pulse Memory rule about `stateVersion`.
- Press `Promote ens-mistake-stale-tick`.
- Press `Code Mode`. The lesson about the bridge publish is still on the page.
- Reload. The promoted mistake is still listed.

## Driving it with verify-visualizer

Preconditions:

- Doctor reports the launched preview.
- A fresh page is Visual Cockpit at `v0`. `data-pulse-count` is `1` and `data-lesson-count` is `1`.

- **Read the seed.** The page text includes `A stale stateVersion never overwrites the workspace.` and `Outcome not confirmed`.
- **Promote.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Promote ens-mistake-stale-tick"`. `data-pulse-count` becomes `2` and the version label becomes `v1`.
- **Open Code Mode.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Code Mode"`. The shell `data-mode` is `code` and the page text includes `Read the card statement before the bridge publish.`
- **Proof.** Run `node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/memory-panel.txt` and `node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/memory-panel.png`. The text file contains the promoted mistake and `v2` after the mode switch.

## Gotchas

- Promotion is a human edit. During a working phase it pauses the run.
- Recording a workflow lesson does not pause a working phase and does not change `stateVersion`.
- A record with no confirmed outcome, and no `user-stated` or hash-backed `tool-verified` status, has no Promote button.
- A superseded row stays off the sparse inject.
- A workspace saved before these fields were added loads with empty memory arrays. The problem cards stay.
- The Neo4j adapter is not on this page. The panel reads the shared workspace.
