# Test suite

Commands, in the order CI `verify` runs the test steps:

| Command | What it runs |
| :--- | :--- |
| `pnpm test` | `@visualizer/core` Vitest files under `packages/core/src/**/*.test.ts` except `critical-flows.test.ts`, plus `@visualizer/mcp`. The MCP file is `apps/mcp/src/server.e2e.test.ts`: it starts the HTTP server and calls tools from a separate client process. CF-09 runs here. |
| `pnpm test:critical-flows` | `packages/core/src/critical-flows.test.ts`, `apps/web/src/critical-flow.dom.test.tsx`, and `apps/web/src/tick-guard.test.ts`. Flow names are in [`CRITICAL-FLOWS.md`](CRITICAL-FLOWS.md). |
| `pnpm test:mbt` | `scripts/test-mbt.ts`. Regenerates simple paths with `getSimplePaths` from `xstate/graph` and checks each step. |
| `pnpm verify:formal` | XState CLI checks plus `checkLockstep`. Bounds are in [formal-verify-visualizer](../.cursor/skills/formal-verify-visualizer/SKILL.md). |
| `pnpm docs:mermaid` | `scripts/verify-mermaid.ts`. Parses every Mermaid fence in `README.md` and `docs/**` with `mermaid.parse`. CI `verify` runs it. |
| `pnpm test:local-model` | `scripts/local-model-smoke.ts`. CF-04 runs this. CI does not require a listening model. |

`pnpm typecheck` and `pnpm build` bookend those commands. They are not part of the test count. None of these commands enter `repos/`, `packages/sources/`, or `packages/liturgy/`. CI does not run `scripts/fetch-ref.sh`. A tree with only `repos/.gitkeep` still passes these commands. `pnpm docs:mermaid` skips `repos/` and `packages/sources/` through `scripts/vendor-paths.ts`. Workspace typecheck includes each package `src` tree only. Vitest include globs stay inside those packages, and the ESLint ignore list starts with `repos/**`.

`J_liturgy` is a separate workflow. It runs `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test --locked` in `packages/liturgy` when `packages/liturgy/**` or `packages/sources/**` change. It does not fetch. It does not run the commands in the table above.

Why these runners were chosen, and whether that choice was looked up or recalled, is in [TECH-CHOICES.md](TECH-CHOICES.md).

A change that adds or replaces a test command updates this file and adds a provenance entry to [TECH-CHOICES.md](TECH-CHOICES.md) in the same change. Follow the one-step loop in [AGENTS.md](../AGENTS.md): record the tools, why they fit, the cited current lookup, and the trend check done before the choice.
