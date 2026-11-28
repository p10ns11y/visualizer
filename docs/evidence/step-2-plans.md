# Step 2 plans

Flow graph only. Later steps stay on later pull requests.

## Head plan

- [x] Add one XState machine in `@visualizer/core` that owns stage (`asking`, `editing`, `choosing tools`, `building`, `done`) and mode (`simple` by default, `advanced` by toggle), with Start, Pause, and Stop.
- [x] Append an event log entry only when that machine takes the event. The log starts empty.
- [x] Retarget `packages/core/src/formal`, `pnpm verify:formal`, and `pnpm test:mbt` off the stand-in railway onto this machine. Every state is reachable, no non-final state is a deadlock, and the model-based paths cover every transition.
- [x] Show the current stage and the event log on the one screen. Do not build a view per stage.

Checks: `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, `pnpm build`.

## Tail plan

- [x] Update `docs/CRITICAL-FLOWS.md`, `docs/ARCHITECTURE-LAYERS.md`, `docs/TEST-SUITE.md`, `README.md`, both verification skills, and `docs/TECH-CHOICES.md`.
- [x] Save `step-2-wide` (1280×800) and `step-2-narrow` (390×844).
- [x] Move the formal sync commit because the covered transitions change. Regenerate model-based paths with `getSimplePaths`.
- [x] Rollback is reverting this pull request. `cursor/bare-shell-a167` stays as it is.
- [x] Do not start steps 3–6.
