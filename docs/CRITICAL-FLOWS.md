# Critical flows

These flows must keep working as Visualizer grows. A pull request that adds or changes a user-facing flow updates this file, the tests behind `pnpm test:critical-flows`, and the verification skills named in `AGENTS.md`.

Each flow below names the test that executes it. The suite fails the `verify` job when any of them break.

## CF-01 Cockpit edit is the code-mode workspace

A person edits a problem-card statement in Visual Cockpit. Code Mode shows that same statement. `stateVersion` increases for the edit and again when the view changes. The railway phase does not change.

Test: `CF-01` in `packages/core/src/critical-flows.test.ts`, plus the shared-store render in `apps/web/src/critical-flow.dom.test.tsx`.

## CF-02 A human edit during Build pauses the run and keeps the edit

Build moves the railway from `idle` into a working phase. A statement edit then pauses the run, sets the banner to paused, and stores the new statement. A later agent tick does not replace the statement or leave `paused_by_human`.

Test: `CF-02` in `packages/core/src/critical-flows.test.ts`, plus the Build pause render in `apps/web/src/critical-flow.dom.test.tsx`.

## CF-03 Tier fallback still finishes on deterministic code

When the frontier client throws, the router asks the local model. When that client also throws, the router returns Tier 1. The offline Build still emits the verified Step 2 brief.

Test: `CF-03` in `packages/core/src/critical-flows.test.ts`.

## CF-04 Local-model harness smoke

`pnpm test:local-model` prints a judgement for the seeded workspace. Exit code is 0 unless `VISUALIZER_LOCAL_MODEL_STRICT=1` and Tier 2 did not answer. A missing server is a successful fallback, not a failed flow.

Test: `CF-04` in `packages/core/src/critical-flows.test.ts`. CI runs this smoke. It does not require a model to be listening.

## CF-05 Stop holds the railway

Stop during a working phase commits `HUMAN_PAUSE`. A later judge tick is a no-op: same object, same statement, same phase.

Test: `CF-05` in `packages/core/src/critical-flows.test.ts`.

## Lockstep properties

`pnpm verify:formal` checks the promise those flows rely on: monotonic `stateVersion`, stale-write rejection, no agent commit while paused or after a terminal phase, and a rest path from every railway phase. The bounds and the command live in `.cursor/skills/formal-verify-visualizer/SKILL.md`.

`pnpm test:mbt` regenerates every simple path from the XState 6 pilot graph and runs each step through the workspace, the connector calls, and the local runner. It is a regression check for these flows, not a new screen.
