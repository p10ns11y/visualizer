# Step 3 plans

View map only. Later steps stay on later pull requests.

## Head plan

- [x] Add a typed map from mode (`simple`, `advanced`) and stage (`asking`, `editing`, `choosing tools`, `building`, `done`) to one view spec. The flow graph stays the owner of both.
- [x] Render that spec with `@ui-sdk/react` and `@ui-sdk/core` at `0.1.0-beta.19`, React 19, and `@types/react` at `19.2.10` or newer. One screen, no scrolling column. Each stage is a short placeholder. Advanced mode adds one panel whose text is `later`.
- [x] Add one small `definePrimitive` named `stage-mark`. Its controlled state is `stage`, so `snapshot` can read it. It is not a page.
- [x] Create the bridge with `createAgent` before render. `registerTools` from `@ui-sdk/react/agent` exposes `snapshot`, `act`, and `query` on `document.modelContext`. The `allow` callback accepts component actions only. When `registerTool` is missing, call `snapshot`, `act`, and `query` on the bridge.
- [x] Test the map and the wiring.

Checks: `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, `pnpm build`.

## Tail plan

- [x] Update `docs/CRITICAL-FLOWS.md`, `docs/ARCHITECTURE-LAYERS.md`, `docs/TEST-SUITE.md`, `README.md`, `.cursor/skills/verify-visualizer/`, and `docs/TECH-CHOICES.md`.
- [x] Leave the formal sync commit where it is. This step does not change the covered transitions.
- [x] Save `step-3-wide` (1280×800) and `step-3-narrow` (390×844).
- [x] Keep the [`adaptate`](https://github.com/p10ns11y/adaptate) credit. The screen schema still uses it.
- [x] Rollback is reverting this pull request. `cursor/flow-graph-1596` stays as it is.
- [x] Do not start steps 4–6.
