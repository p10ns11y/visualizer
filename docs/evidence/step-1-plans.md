# Step 1 plans

Bare shell. Later steps stay on later pull requests.

## Head plan

- [x] Delete the old screen and `apps/mcp`, `packages/core/src/memory`, `packages/core/src/fleet`, `packages/core/src/brain`, `docker-compose.neo4j.yml`, the memory panel, the sketch pad, and the feature notes for those flows.
- [x] Keep `packages/core/src/railway/pilot.ts`, `packages/core/src/formal`, `scripts/verify-formal.ts`, `scripts/test-mbt.ts`, `pnpm docs:mermaid`, and `scripts/fetch-ref.sh`.
- [x] Retarget `packages/core/src/mbt/run.ts` and the lockstep off `state/sample.ts`, `strokes.ts`, and `tools/delegation.ts` onto a stand-in workspace. `pnpm test:mbt` and `pnpm verify:formal` pass on this change alone.
- [x] Replace `packages/core/src/critical-flows.test.ts` and `apps/web/src/critical-flow.dom.test.tsx` with the empty-screen checks.
- [x] Render one screen in `apps/web`. The page does not scroll.
- [x] Rewrite `docs/CRITICAL-FLOWS.md`, `docs/ARCHITECTURE-LAYERS.md`, and `docs/TEST-SUITE.md` as short diagrams.

Checks: `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, `pnpm build`. Desktop and mobile shots show one screen.

## Tail plan

- [x] Update `README.md`, the three docs above, the verification skills, the adaptate note, and `docs/TECH-CHOICES.md`.
- [x] Save `bare-shell-desktop.png` and `bare-shell-mobile.png`.
- [x] Move the formal sync commit because `applyBuildTick` changed. Regenerate model-based paths with `getSimplePaths`.
- [x] Rollback is reverting this pull request. `4c7dac8` stays in history.
- [x] Do not start steps 2–6. Do not touch liturgy.
