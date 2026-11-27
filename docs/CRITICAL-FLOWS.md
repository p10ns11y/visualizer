# Critical flows

These flows must keep working as Visualizer grows. A pull request that adds or changes a user-facing flow updates this file, the tests behind `pnpm test:critical-flows`, and the verification skills named in `AGENTS.md`.

Tool choices for these flows, the unit suite, the formal check, and the model-based paths are logged in `docs/TECH-CHOICES.md`. The commands are listed in `docs/TEST-SUITE.md`. A change that adds a flow or a test command appends a provenance entry there in the same change, using the one-step loop in `AGENTS.md`: tools, why they fit, a cited current lookup, and a trend check done before the choice.

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

## CF-06 A stroke stays pinned to its card

A stroke drawn on the canvas plate is stored on the freehand problem card. The same stroke is still there after the workspace is serialized and read back, and Code Mode shows that card id. Drawing while the railway is in a working phase pauses the run. A later agent tick does not drop the stroke or leave `paused_by_human`.

Test: `CF-06` in `packages/core/src/critical-flows.test.ts`, plus the sketch render, reload, and slow-judgement pause in `apps/web/src/critical-flow.dom.test.tsx`.

## CF-07 A confirmed Ensembly record becomes Pulse Memory

A pre-memory workspace still loads: the ledger, Pulse Memory, and workflow lessons are empty, and the problem cards stay. Appending a record with no confirmed outcome leaves Pulse Memory empty. Appending one with a confirmed outcome promotes it. A workflow lesson stays attached to its phase and card after Code Mode opens. Recording that lesson, appending a ledger row, or promoting a row during a working phase leaves the phase running and does not change `stateVersion`. A lesson recorded while a build tick is awaiting is still present after that tick lands, and the railway keeps the tick. A stale `stateVersion` does not append. The promoted record is still there after serialize and read.

Test: `CF-07` in `packages/core/src/critical-flows.test.ts`, including the working-phase lesson, plus the promote, code-mode, reload, and pre-memory hydration renders in `apps/web/src/critical-flow.dom.test.tsx`, and the mid-await lesson in `apps/web/src/tick-guard.test.ts`.

## CF-08 WebMCP bridge registers, rejects a stale write, and unregisters

The page registers read tools and `stateVersion`-guarded write tools on `document.modelContext` when that getter exists, otherwise on an in-app bridge. Read tools include `read_pulse_inject`, `read_pulse_memory`, the ledger, and the event log. Ledger, lesson, and event-log reads take `limit` and `cursor`. `read_pulse_memory` with `inject` returns the sparse inject and does not repeat the entry list. A write with local approval and a stale `stateVersion` returns `STATE_CONFLICT` and does not append. An approved ledger append during a working phase does not pause the railway. Releasing the bridge removes the tools. Local write approval is stored under `visualizer.webmcp.approval` and is removed when the toggle is turned off.

Test: `CF-08` in `packages/core/src/critical-flows.test.ts`, plus the bridge strip and the approval reload in `apps/web/src/critical-flow.dom.test.tsx`.

## CF-09 A separate MCP client uses the headless server

`@visualizer/mcp` listens on `127.0.0.1` and persists the workspace to a JSON file with mode `0600`. A read does not create that file. With writes off, `list_cards` succeeds and `append_ensembly_record` returns `READ_ONLY`. A `Host` or `Origin` outside localhost receives `403`. With `VISUALIZER_MCP_ALLOW_WRITES=1`, an append is visible to a second client process on the same file. With `VISUALIZER_MCP_WRITE_TOKEN` set, a promote without the bearer stays read only, an empty bearer stays read only, and the same call with the bearer succeeds. The server log does not contain the token. The process refuses a host other than `127.0.0.1` and a state path outside `VISUALIZER_MCP_STATE_ROOT`. A ledger append from a second process during a build tick is still in the file after the tick lands.

Test: `external MCP client` in `apps/mcp/src/server.e2e.test.ts` and `keeps a ledger append from a second process` in `apps/mcp/src/workspace-file.test.ts`, both executed by `pnpm test`.

## CF-10 An agent files a fleet proposal by action id

The interconnection map renders the sample fleet from a Zod catalog. An unknown component is rejected. The catalog lists pending proposals only, capped so a long decided ledger does not overflow the page. A spec that fails validation shows the rejection and leaves the map mounted. `snapshot` lists typed action ids. `act` without local approval returns `READ_ONLY` and files nothing. With approval, `act` appends one pending proposal, returns that row, and does not change the fleet graph or `stateVersion`. A second pending row for the same action is refused. A proposal written beside a railway step is still there after `mergeAuxIntoTick`. An approval during that step stays approved, because the live ledger replaces the tick copy. Approving or rejecting appends a memory log entry, increments `logSeq`, and still does not rewrite the graph. The sample analysis reports a cycle, a fan-in hotspot, a fan-out hotspot, orphan nodes, and a dead edge.

Test: `CF-10` in `packages/core/src/critical-flows.test.ts`, the catalog and bridge cases in `packages/core/src/fleet/fleet.test.ts`, the MCP round-trip in `apps/mcp/src/server.e2e.test.ts`, and the map render in `apps/web/src/critical-flow.dom.test.tsx`.

## Lockstep properties

`pnpm verify:formal` checks the promise those flows rely on: monotonic `stateVersion`, stale-write rejection, no agent commit while paused or after a terminal phase, and a rest path from every railway phase. The bounds and the command live in `.cursor/skills/formal-verify-visualizer/SKILL.md`.

`pnpm test:mbt` regenerates every simple path from the XState 6 pilot graph and runs each step through the workspace, the connector calls, and the local runner. It is a regression check for these flows, not a new screen.
