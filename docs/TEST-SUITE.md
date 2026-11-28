# Test suite

Commands, in the order CI `verify` runs the test steps:

| Command | What it runs |
| :--- | :--- |
| `pnpm test` | `@visualizer/core` Vitest files under `packages/core/src/**/*.test.ts` except `critical-flows.test.ts`, plus `@visualizer/mcp`. Memory coverage is `packages/core/src/memory/memory.test.ts` (Canon 1 packs, box packs that omit `ext`, admission, the serialized inject budget, aux lessons, and ledger writes that stay in the working phase). WebMCP coverage is `packages/core/src/webmcp/bridge.test.ts`. Fleet catalog, analysis, approval, and the mid-tick proposal are `packages/core/src/fleet/fleet.test.ts`. The guided tick merge is `packages/core/src/bootstrap/guided.test.ts`. PR #3 and PR #4 payload hydration is `packages/core/src/state/persist.test.ts`. The MCP file is `apps/mcp/src/server.e2e.test.ts`: it starts the HTTP server and calls tools from a separate client process, including `snapshot` and `act`. |
| `pnpm test:critical-flows` | `packages/core/src/critical-flows.test.ts`, `apps/web/src/critical-flow.dom.test.tsx`, and `apps/web/src/tick-guard.test.ts`. Flow names are in `docs/CRITICAL-FLOWS.md`. CF-06 (pinned strokes), CF-07 (Pulse Memory promotion, workflow lessons, ledger writes that stay in the working phase, the mid-await lesson, and pre-memory hydration), CF-08 (WebMCP register, stale write, release, and saved approval), and CF-10 (fleet catalog, `snapshot` / `act`, and a proposal kept across a tick merge) run on this command. CF-09 (the headless MCP client, host and origin refusal, file mode, empty bearer, and the concurrent ledger append) runs under `pnpm test`. |
| `pnpm test:mbt` | `scripts/test-mbt.ts`. Regenerates simple paths with `getSimplePaths` from `xstate/graph` and checks each step. |
| `pnpm verify:formal` | XState CLI checks plus `checkLockstep`. Bounds are in `.cursor/skills/formal-verify-visualizer/SKILL.md`. |
| `pnpm docs:mermaid` | `scripts/verify-mermaid.ts`. Parses every Mermaid fence in `README.md` and `docs/**` with `mermaid.parse`. CI `verify` runs it. |
| `pnpm test:local-model` | `scripts/local-model-smoke.ts`. CF-04 runs this. CI does not require a listening model. |

`pnpm typecheck` and `pnpm build` bookend those commands. They are not part of the test count. None of these commands enter `repos/`. `pnpm docs:mermaid` skips that directory through `scripts/vendor-paths.ts`. Workspace typecheck includes each package `src` tree only. Vitest include globs stay inside those packages, and the ESLint ignore list starts with `repos/**`.

Why these runners were chosen, and whether that choice was looked up or recalled, is in `docs/TECH-CHOICES.md`.

A change that adds or replaces a test command updates this file and adds a provenance entry to `docs/TECH-CHOICES.md` in the same change. Follow the one-step loop in `AGENTS.md`: record the tools, why they fit, the cited current lookup, and the trend check done before the choice.
