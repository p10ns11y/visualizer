# Test suite

Commands, in the order CI `verify` runs the test steps:

| Command | What it runs |
| :--- | :--- |
| `pnpm test` | `@visualizer/core` unit file `packages/core/src/foundation.test.ts` (Vitest). |
| `pnpm test:critical-flows` | `packages/core/src/critical-flows.test.ts` and `apps/web/src/critical-flow.dom.test.tsx`. Flow names are in `docs/CRITICAL-FLOWS.md`. CF-06 (pinned strokes, reload, and a draw that pauses a working phase) runs on this same command. |
| `pnpm test:mbt` | `scripts/test-mbt.ts`. Regenerates simple paths with `getSimplePaths` from `xstate/graph` and checks each step. |
| `pnpm verify:formal` | XState CLI checks plus `checkLockstep`. Bounds are in `.cursor/skills/formal-verify-visualizer/SKILL.md`. |
| `pnpm test:local-model` | `scripts/local-model-smoke.ts`. CF-04 runs this. CI does not require a listening model. |

`pnpm typecheck` and `pnpm build` bookend those commands. They are not part of the test count.

Why these runners were chosen, and whether that choice was looked up or recalled, is in `docs/TECH-CHOICES.md`.

A change that adds or replaces a test command updates this file and adds a provenance entry to `docs/TECH-CHOICES.md` in the same change. Follow the one-step loop in `AGENTS.md`: record the tools, why they fit, the cited current lookup, and the trend check done before the choice.
