# Step 4 plans

Questions, wireframe preview, and gap cards. Later steps stay on later pull requests.

## Head plan

- [x] Add four preset questions in a typed data file. What: website, web app, SaaS, game, Three.js, mobile. Who: just me or users. Two more ask what it should hold and how people open it.
- [x] Keep one wireframe template for each what answer in a typed data file. Render that template in the right-hand preview from ui-sdk components.
- [x] Add a gap-card rules data file. `openGaps(answers, design)` returns the required decisions that are still open. The asking screen calls it on every answer. Design stays empty until edits exist.
- [x] Leave the event log to the flow graph. An answer does not add a log line.
- [x] Expose the encoded answers and the open gaps through the existing snapshot and query bridge.
- [x] Test the templates, the gap set for each answer, and a critical flow that answers the questions and sees the preview and the cards change.
- [x] Keep one screen: questions on the left, preview on the right, no scrolling column, at 1280×800 and 390×844.

Checks: `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, `pnpm build`.

## Tail plan

- [x] Update `docs/CRITICAL-FLOWS.md`, `docs/ARCHITECTURE-LAYERS.md`, `docs/TEST-SUITE.md`, `README.md`, `.cursor/skills/verify-visualizer/`, and `docs/TECH-CHOICES.md`.
- [x] Leave the formal sync commit where it is. This step does not change the covered transitions.
- [x] Save `step-4-wide` (1280×800) and `step-4-narrow` (390×844).
- [x] Keep the [`adaptate`](https://github.com/p10ns11y/adaptate) credit. The screen schema still uses it.
- [x] Rollback is reverting this pull request. `main` at `4258424` stays as it is.
- [x] Do not start steps 5–6.
