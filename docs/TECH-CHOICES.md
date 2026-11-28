# Tech choices

Provenance for the steps on this branch. Each entry says what was chosen, why, whether that came from training-data recall or from a lookup, and whether wider trends were checked **before** the choice. A later lookup does not rewrite an earlier "no".

Entries dated before the build cadence record what actually happened, including training-data recall and skipped trend checks. From the one-step loop in `AGENTS.md` onward, a new entry cites a current lookup and a trend check completed before the choice. The rule also lives in `docs/CRITICAL-FLOWS.md` and `docs/TEST-SUITE.md`.

## XState v6 upgrade

- **Chosen:** `xstate@6.0.0-beta.5`. Object transitions, `setup({ schemas })`, string `initial`, and pure `transition` / `initialTransition` tuples. `machineToJSON` feeds the CLI. No I/O inside transition calculation.
- **Why:** The product lock already required an XState railway. The upgrade had to follow the v6 authoring contract shipped with the beta that `xstate@beta` resolved, so v5 string targets would not survive typecheck.
- **Basis:** Researched, from the docs in the installed package `node_modules/.pnpm/xstate@6.0.0-beta.5/node_modules/xstate/docs/` — `index.md`, `agents.md`, `xstate-v5-to-v6.md`, and `api-stability.json`. Not from memory of v5.
- **Latest trends checked before choosing:** No. Other state-machine libraries were not compared; XState was already locked. After install, nobody checked npm for a newer beta than `6.0.0-beta.5`. The Stately `xstate-v6` skill, which notes that npm `latest` is still 5.x, was installed later and was not an input to this choice.

## Test suite

- **Chosen:** Vitest (`vitest` `^3.2.4` in `@visualizer/core` and `apps/web`; the core run resolved 3.2.7). `pnpm test` runs `packages/core/src/foundation.test.ts` (24 tests). The web package uses Vitest with jsdom for the two shared-screen tests. Critical-flow files are a separate command.
- **Why:** The web app is Vite, and Vitest runs the TypeScript source in that pipeline. Splitting the critical-flow command keeps a unit failure distinct from a user-flow failure.
- **Basis:** Training-data recall of the Vite and Vitest pairing, then the versions pnpm wrote into the lockfile. No Vitest guide was read before the script was added.
- **Latest trends checked before choosing:** No. `node:test`, Jest, and other runners were not compared.

## Critical-flow spec

- **Chosen:** `docs/CRITICAL-FLOWS.md` with CF-01 through CF-05, `pnpm test:critical-flows` (core config `packages/core/vitest.critical.config.ts` plus the web jsdom file), and the matching rule in `AGENTS.md`. CI `verify` runs the command.
- **Why:** The task asked for a living list of user-facing flows that fails `verify` when a flow breaks, separate from the unit file.
- **Basis:** The task text, mapped onto behaviors already in the store and the cockpit (shared workspace, human pause, tier fallback, local-model smoke, Stop). No external spec format was opened.
- **Latest trends checked before choosing:** No. Cucumber, Playwright traces, and other journey formats were not compared.

## Formal verification

- **Chosen:** `pnpm verify:formal`. It runs `xstate validate` and `xstate test` on `packages/core/src/formal/pilot.safe.checks.json` and `pilot.fail.checks.json`, then `checkLockstep` in `packages/core/src/formal/lockstep.ts`. The search is a bounded interleaving of the real transition functions (max `stateVersion` 8, 1500 fingerprints). This is not a TLA+ model.
- **Why:** The task asked for one cheap command that checks monotonic `stateVersion`, stale-write rejection, human-pause exclusivity, and a rest path from every phase, on the functions the app actually calls. A second model would drift from those functions. The CLI checks cover only the representative events in the JSON files, and the report says so.
- **Basis:** The four properties and the one-command constraint came from the task. CLI behavior came from the installed `xstate@6.0.0-beta.5` binary and `machineToJSON`. The bounded search is original code for this repo. Training-data recall supplied the shape of an explicit-state search; no paper was opened.
- **Latest trends checked before choosing:** No. TLA+, Alloy, Quint, and the Stately skill's TLA corpus were not compared. The skill note that a future TLA+ model is read with `/statechart` was written after the checker existed. The Stately skill itself was installed later.

## Stately skill

- **Chosen:** Global install only: `npx --yes skills add statelyai/skills -a cursor -g -y --json`. On the machine aliased `laptop-1` the files landed in `.agents/skills/` as `stately`, `state-management`, `xstate-v5`, `xstate-v6`, and `readme`. They are not in the repo and not in this cloud agent's skill catalog (`.agents/skills` is not on that catalog path).
- **Why:** The task asked to install those skills into Cursor on this VM and to leave the repo and the pull request untouched. A global install avoided a dirty worktree.
- **Basis:** Researched, current information. The task named `github.com/statelyai/skills` and `https://stately.ai/docs/skills`. The installer fetched that repo, and the five directories were listed from disk afterward. The installer reported a Snyk critical finding on `stately` and low findings on the other four; that report was recorded, not used to pick a different pack.
- **Latest trends checked before choosing:** No marketplace comparison. Yes for installing the named repo as it existed when that command ran.

## Model-based testing and adaptate

- **Chosen:** `getSimplePaths` from `xstate/graph`, executed by `pnpm test:mbt` (`scripts/test-mbt.ts`, `packages/core/src/mbt/run.ts`). The last green local run walked 29 paths and 113 pilot steps and required all 8 phases. `@xstate/test` and fast-check were not added. Connector calls go through `@adaptate/core@3.0.0` (`transformSchema`, `parse`, `parseStream`, `createStreamValidator`, `isSettled`, `verifyStream`) and the existing `@adaptate/utils@3.0.0` `zodToOpenAPISchema`.
- **Why:** The installed model-based testing page says v6 `xstate/graph` only generates paths, and that `testPaths()` from `@xstate/test` is the stock runner. The invariants here are workspace version, human-pause safety, store parity, and tool-call I/O, so the runner calls those functions directly. Adaptate was already the locked contract library; the task asked to use its stream and validation tools on the tool-call layer.
- **Basis:** Researched, from the installed package. Path generation: `node_modules/.pnpm/xstate@6.0.0-beta.5/node_modules/xstate/docs/model-based-testing.md` and the `xstate/graph` removal note in `xstate-v5-to-v6.md`. Adaptate: the `.d.ts` files under `packages/core/node_modules/@adaptate/core/build/` (`index`, `result`, `stream`, `stream-incremental`, `verify`) and `@adaptate/utils`. `verifyStream` compares `context.name` to the manifest; passing the name only on the manifest failed a real run, and the call was fixed from that failure.
- **Latest trends checked before choosing:** No. fast-check, Hypothesis, and other model-based tools were not surveyed. The only runner alternative on record is the `@xstate/test` sentence in the installed XState doc. `@adaptate/core` and `@adaptate/utils` stayed on the pinned `3.0.0`; a newer release was not looked up.

## Build cadence

- **Chosen:** One product step per pass, then stop for review. The loop is: state the goal and both plans, choose tools from a current lookup after a trend check, implement that step, then run `pnpm test:mbt`, `pnpm test:critical-flows`, and `pnpm verify:formal` and wait for a green CI `verify` before the next step.
- **Why:** Batching the next product step into the current one skips review. The verification commands are the ones that already cover the railway paths, the user-facing flows, and the lockstep properties.
- **Basis:** The written instruction to lock this cadence into `AGENTS.md` on the foundation step. No delivery-process guide was opened.
- **Latest trends checked before choosing:** No. The loop was specified. Iterative-delivery writeups were not compared before it was written down.

## Target layering

- **Chosen:** Write the target in `docs/ARCHITECTURE-LAYERS.md` and do not add a native crate in this step. Heavy payload work stays in `adaptate`. Visualizer's own thin core may be Rust or Zig, with C or C++ only when a dependency forces it. The language is not picked here.
- **Why:** The cockpit and the XState 6 railway are already the JS state layer. `adaptate` already ships the Rust acceleration path, so a second scanner would duplicate it. Leaving Rust versus Zig open avoids a recall-based language pick.
- **Basis:** Current lookup of `github.com/p10ns11y/adaptate` `main` on 2026-11-27: `crates/adaptate-accel/Cargo.toml` (`rlib` and `cdylib`, features `native`, `wasm`, `gpu`), `crates/adaptate-accel/README.md` (`wasm32-unknown-unknown` and the Node-API copy step), `packages/native/package.json` (`@adaptate/native` `3.0.0`), `packages/wasm/package.json` (`@adaptate/wasm` `3.0.0`), and `packages/accel/package.json` (`@adaptate/accel` `3.0.0`, optional dependencies on the other two).
- **Latest trends checked before choosing:** Yes, before writing the spec, and they were not used to lock a language. [NAPI-RS WebAssembly](https://napi.rs/docs/concepts/webassembly) documents `wasm32-wasip1-threads` as the generated Rust addon fallback and says `wasm32-unknown-unknown` is not that generated path. [zig-napi](https://github.com/openharmony-zig/zig-napi) documents Zig `0.17.0` Node and WASI builds, and says Zig `0.17` cannot build a multithreaded WASM module so its threaded flavor uses JavaScript workers. A June 2026 comparison ([Rust vs Zig for WebAssembly](https://www.mayhemcode.com/2026/06/rust-vs-zig-which-language-to-choose.html)) describes Rust `wasm-bindgen` / `wasm-pack` as the mature interop path and Zig as pre-1.0 with manual JS marshalling and a smaller runtime. That article's April 2026 "Zig 0.16" line is older than zig-napi's `0.17.0` requirement. `adaptate-accel` itself still builds `wasm32-unknown-unknown`, which is a fact about that repo, not a reason to retarget it from here.

## Freehand strokes on the canvas plate

- **Chosen:** Keep each stroke in `WorkspaceState.strokes` as a `cardId` plus normalized pointer samples (`packages/core/src/state/strokes.ts`, Zod on `SketchStrokeSchema`). Capture with Pointer Events on the canvas plate: `setPointerCapture`, and `getCoalescedEvents()` when it returns samples, otherwise the dispatched event once. Paint the outline with `perfect-freehand@1.2.3` `getStroke` into an SVG path (`apps/web/src/stroke-path.ts`). Commit one stroke on pointerup through `commitHuman`, so a working phase becomes `paused_by_human`. Persist the whole workspace under `localStorage` key `visualizer.workspace`. Code Mode lists the strokes and clears one card at a time. After `applyBuildTick` resolves, `pendingTickStillApplies` drops the result when the run token or `stateVersion` moved.
- **Why:** The plate has to show freehand ink, and Code Mode has to show the same samples after a reload. A bitmap canvas would not round-trip through the Zod workspace. A centerline polyline is enough for storage and is what we store. The outline step is what makes the ink look like a pen. `perfect-freehand` does only that step. tldraw was the other named drawing stack in the lookup, and it is an editor with its own scene graph and a license that does not fit this cockpit. The post-await check is there because the judge and handoff ticks read a snapshot, await, then return a new workspace from that snapshot. Applying it after a human stroke would replace the pause.
- **Basis:** Current lookup on 2026-11-27, before this choice. [perfect-freehand 1.2.3](https://www.npmjs.com/package/perfect-freehand) (package page updated 2026-02-01) exports `getStroke`, documents Pointer Events plus an SVG path, and simulates pressure from point spacing. The installed `dist/types/getStroke.d.ts` matches that signature. [MDN `PointerEvent.getCoalescedEvents()`](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents) says drawing code wants the un-coalesced samples and that the method is limited availability, including a secure-context note. [perfect-freehand issue 58](https://github.com/steveruizok/perfect-freehand/issues/58), closed 2026-02-01, says fast strokes need those extra samples. [Nerva ADR 003](https://github.com/blancmathis/nerva/blob/main/docs/adr/003-drawing-engine.md) (2026-07-20) pins `perfect-freehand` 1.2.3 for outlines, keeps the scene model outside the library, and uses Pointer Events with a coalesced-event fallback. That ADR also records why tldraw stayed out: its license.
- **Latest trends checked before choosing:** Yes. Compared `perfect-freehand` outlines, native Pointer Events with SVG smoothing and coalesced samples, and a full drawing editor (tldraw, as cited by the Nerva ADR). The stored contract is the native samples. The library is only the outline. No newer `perfect-freehand` than 1.2.3 was on the npm page that day.

## Two-layer memory on Ensembly and Neo4j

- **Chosen:** Keep the Ensembly ledger, Pulse Memory, and workflow lessons on `WorkspaceState`, with `.default(() => [])` so a payload from before this slice still parses. Promotion requires `confirmedOutcome`. JSONL lines and `ensembly-pulse-pack-v1` packs are the ledger exchange (`packages/core/src/memory/ensembly.ts`). The hash material follows `compute_pack_hash` in ensembly `pulse_pack.rs` (struct field order, sorted JSON-object keys, SHA-256). `MemoryGraphStore` is the port. `Neo4jMemoryStore` uses `neo4j-driver@6.3.2` and parameterized Cypher. `InMemoryGraphMemoryStore` is what CI runs. `cypher/vector-index.cypher` is documented and not applied. Neo4j MCP `graph_query` and GraphRAG `HybridCypherRetriever` are named as read-side hooks, not dependencies. Writes go through `commitHuman`.
- **Why:** The ledger has to stay append-only and checkable, and the cockpit has to show rules and lessons without a database. A graph pays off for lesson → phase → card. The house pulse-memory note that SQLite is enough for a single `LIMIT 8` list is about that SQLite store. This slice does not replace it. The in-memory port keeps `verify` off Bolt. `neo4j-driver-lite` drops the reactive API this code does not use, and the Python GraphRAG package is the wrong runtime.
- **Basis:** Current lookup on 2026-11-27, before the choice. [neo4j-driver 6.3.2](https://www.npmjs.com/package/neo4j-driver) was published 2026-11-11, requires Node.js `>=18`, and ships TypeScript types. The [JavaScript driver install page](https://neo4j.com/docs/javascript-manual/current/install/) says driver 6.x connects to Neo4j 4.4, 5, 2025, and 2026, and shows a local Docker run. [Cypher index syntax](https://neo4j.com/docs/cypher-manual/current/indexes/syntax/) documents `CREATE VECTOR INDEX … WITH [filterable properties]` for Neo4j 2026.01. [GraphRAG retrievers](https://neo4j.com/docs/neo4j-graphrag-python/current/user_guide_rag.html) describe `HybridCypherRetriever` and in-index `SEARCH` filters on 2026.01. [neo4j-agent-memory MCP](https://neo4j.com/labs/agent-memory/reference/mcp-tools/) says `graph_query` blocks `CREATE`, `MERGE`, `DELETE`, `SET`, and `REMOVE`. Ensembly pack fields and `ensembly-pulse-pack-v1` were read from [pulse_pack.rs](https://github.com/thecuriousts/ensembly/blob/e3a4d33dd859b572cc4991f31332b7ac58c2e7f4/crates/ensembly-kernel/src/pulse_pack.rs) at that commit.
- **Latest trends checked before choosing:** Yes. Compared the official JavaScript driver 6.3.2, `neo4j-driver-lite`, Python `neo4j-graphrag` (including 2026.01 `SEARCH` filters), the Neo4j agent-memory MCP server, and leaving the projection in the workspace only. The driver plus an in-memory port matched the CI rule. The vector index stays a file until embeddings exist. No newer stable `neo4j-driver` than 6.3.2 was on the npm page that day.

## Fleet comparison note

- **Chosen:** A section in `docs/ARCHITECTURE-LAYERS.md`, linked from `README.md`. No package, schema, or runtime change. The section compares this repo's cockpit, XState 6 railway, Ensembly and Neo4j memory, and the four-layer target with Chris Tate's (`@ctatedev`) 27 Nov 2026 fleet diagram.
- **Why:** The comparison belongs next to the layer diagram. A new library would not make the local/remote split, the Coordinator versus Orchestrator split, or the Board any clearer.
- **Basis:** The post text and time (27 Nov 2026, 05:06 UTC) were read on 2026-11-27 from `https://x.com/ctatedev/status/2126180726278353288` via `https://api.fxtwitter.com/ctatedev/status/2126180726278353288`. The diagram image at `pbs.twimg.com/media/HYG2GgFWAAAzI1j.jpg` shows Me and Approvals on the local side, GitHub, Slack, and Vercel under that approval list, Coordinator with Memory, Orchestrator with Jobs, and a radial agent fleet around Board. Direct X API read was refused for a missing billing scope, so the fxtwitter payload and the image were the lookup.
- **Latest trends checked before choosing:** Not a tool selection. The diagram was compared with the layers already written in this file before the section was added. No second fleet runtime was adopted.

## Ensembly log instead of a `@vercel/board` SQLite mirror

- **Chosen:** Keep Ensembly, adapted for this cockpit, as the shared event and board log. Do not add `@vercel/board` and do not mirror the log into its `local()` SQLite file. Cross-machine sync stays an open design named in `docs/decisions/001-ensembly-vs-vercel-board-sync.md`: Cloudflare Workers, hooks, and Cloudflare storage (Durable Objects, D1, or R2), with no product selected. `@vercel/board` may later sit behind a port as an optional transport.
- **Why:** The ledger already has confirmed-outcome promotion, and the railway already has a formal check. A second SQLite board would split that log. The hosted board's claim lease, actor line, sandbox credential, and live tail are the primitives worth copying into the open sync slice.
- **Basis:** Current lookup on 2026-11-27, before the record. [npm `@vercel/board` 0.56.1](https://www.npmjs.com/package/@vercel/board) (page updated 2026-11-23) is Apache-2.0. [Board docs](https://vercel.com/docs/board) describe the Team → Board → Channel → Thread → Message log, Experimental status, United States storage with no region setting, pricing that is free while experimental and may change, OIDC and `BOARD_TOKEN`, and `sandboxPolicy()`. [Tasks](https://vercel.com/docs/board/concepts/tasks) describe a lease of up to 5 minutes and the `task_claimed` conflict. [Sync](https://vercel.com/docs/board/concepts/sync) maps Slack and Linear both ways, and GitHub inbound unless replies are enabled, through Vercel Connect. The changelog [Vercel Board is now available](https://vercel.com/changelog/vercel-board-is-now-available) is dated 18 Nov 2026. The SDK reference says `local()` stores the board in SQLite under `.board/`.
- **Latest trends checked before choosing:** Yes, for the log host. Compared the hosted `@vercel/board` 0.56.1 API, its `local()` SQLite backend, and extending the Ensembly ledger this repo already writes. Ensembly stayed the log. Cloudflare Workers, Durable Objects, D1, and R2 were named as the open sync slice and were not selected. No newer `@vercel/board` than 0.56.1 was on the npm page that day.

## Lesson list filter after WITH

- **Chosen:** `listLessonsQuery` keeps `OPTIONAL MATCH` for the card, then `WITH lesson, phase, card`, then `WHERE` on `phase.name` and `card.id`. No new package.
- **Why:** A `WHERE` glued to `OPTIONAL MATCH` only constrains that pattern. A failed predicate nulls `card` and still returns the lesson, so a phase or card filter would not exclude rows in Neo4j.
- **Basis:** Current lookup on 2026-11-27. The [OPTIONAL MATCH page](https://neo4j.com/docs/cypher-manual/current/clauses/optional-match/) says the `WHERE` clause is part of the pattern description and is considered while looking for matches, not after. The [WHERE page](https://neo4j.com/docs/cypher-manual/current/clauses/where/) says `WHERE` after `WITH` filters the results. Neo4j support article 115012301627 shows the same move: `OPTIONAL MATCH`, then `WITH`, then `WHERE`.
- **Latest trends checked before choosing:** Not a library choice. Compared leaving the predicate on `OPTIONAL MATCH`, a required `MATCH` on the card whenever `cardId` is set, and `WITH` then `WHERE` for both filters. The `WITH` boundary covers a null phase, a null card, and both filters in one query.

## WebMCP browser bridge

- **Chosen:** `document.modelContext.registerTool(tool, { signal })`, with `navigator.modelContext` only when the document getter is missing, and an in-memory bridge when neither getter exists. Cleanup aborts the `AbortSignal` and calls `unregisterTool(name)` only if that method is still on the host. `provideContext` and `clearContext` are not called. Tool inputs are Zod objects converted by `zodToOpenAPISchema` from `@adaptate/utils@3.0.0`. Recoverable failures return `{ ok: false, code }` from `execute`. Write tools stay read only until the page sets local approval, then they call `pauseRun`, `recordWorkflowLesson`, or `appendEnsemblyRecord`.
- **Why:** The current WebMCP shape is per document and additive. A replace-all context call was removed because another script could wipe the page's tools. The in-memory host lets unit and jsdom tests register, invoke, and release tools without a browser flag. Zod was already the workspace schema; the installed converter emits the JSON Schema object shape (`type`, `properties`, `required`) that `registerTool` expects. The lesson and Ensembly tools wrap the store helpers already on `main`, and they return shallow copies of the rows.
- **Basis:** Researched on 2026-11-27, before the bridge was written. [Chrome WebMCP updates](https://developer.chrome.com/docs/ai/webmcp/updates) (navigator getter deprecated in Chrome 150 and removed in Chrome 152; `provideContext` / `clearContext` removed in Chrome 147; `unregisterTool` replaced by `AbortSignal` in Chrome 148; the detection line is `document.modelContext || navigator.modelContext`). [Chrome imperative API guide](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools) (`registerTool` options `signal`, JSON Schema `inputSchema`, `execute(input, { signal })`, structured error returns, `readOnlyHint`). [Migration appendix](https://webmcp.salnikov.no/appendix-d-migration.html) (`provideContext` removed 5 March 2026, `unregisterTool` removed 26 March 2026, getter moved to `Document` on 27 May 2026). Converter check: calling the installed `zodToOpenAPISchema` on a Zod object printed `type: "object"` plus `required`.
- **Latest trends checked before choosing:** Yes, on 2026-11-27, from those three pages. The current registration shape is `document.modelContext` plus `registerTool` and an abort signal. `navigator.modelContext` remains a compatibility read for older Chrome. `provideContext` is not a current API. Hand-written JSON Schema and a new schema package were not added; the locked Zod and `@adaptate/utils` path already matched the documented object schema. AJV and TypeBox were not surveyed as replacements.

## Chopin interop proposal

- **Chosen:** A written proposal only (`docs/decisions/002-chopin-interop-via-mcp.md`). No Chopin package, client, or adapter code.
- **Why:** Chopin is a self-hosted Bun and Postgres planning prototype. Its default Planner does not execute code. Coupling the railway to those APIs would import an upstream that can still move.
- **Basis:** Researched on 2026-11-27 from [`githubnext/chopin` `docs/architecture.md`](https://github.com/githubnext/chopin/blob/main/docs/architecture.md) on `main`: one Bun process, Postgres, Streamable HTTP MCP at `/mcp`, `HARNESS=remote` on the `/api/v1/agent` WebSocket, and Decision records stored outside the MDX prose.
- **Latest trends checked before choosing:** Yes, that architecture page, before the proposal was written. Other planning servers were not compared. No client library was added.

## Ensembly pulse alignment audit

- **Chosen:** A written audit only (`docs/decisions/003-ensembly-pulse-alignment-audit.md`). No change to `canPromote`, `recordWorkflowLesson`, or the pulse-pack alias in this slice.
- **Why:** The cockpit ledger matches the sparse verified-decision idea and the "remembers and learns, never decides" line, and it still uses a shorter admission rule and a legacy pack alias. Writing the drift down keeps the next slice from re-litigating the comparison.
- **Basis:** Read on 2026-11-27, before this note. [Pulse instead of dump](https://captain.kingsparrow.space/articles/memory-issue), [Archive is not memory](https://captain.kingsparrow.space/articles/memory-issue/archive-not-memory), [HITL and HOOTL](https://captain.kingsparrow.space/articles/hitl-hootl), and [`PULSE-PACK-SPEC.md`](https://github.com/thecuriousts/ensembly/blob/master/docs/spec/PULSE-PACK-SPEC.md) plus `crates/ensembly-memory` in `thecuriousts/ensembly`.
- **Latest trends checked before choosing:** Yes, those pages, before the note was written. No second memory runtime was added.

## Head Plan and Tail Plan for this slice

Checked off after the rebase onto `9ffd45d` and the bridge alignment.

### Head Plan

- [x] Rebase onto `origin/main` (`9ffd45d`) and keep `SketchPad`, `strokes`, `pendingTickStillApplies`, `MemoryPanel`, `ensemblyLedger`, `pulseMemory`, `workflowLessons`, `recordWorkflowLesson`, `appendEnsemblyRecord`, and `workspaceStorageKey = "visualizer.workspace"`.
- [x] Mount the WebMCP bridge and status strip beside `SketchPad` and `MemoryPanel` in `apps/web/src/App.tsx`.
- [x] Keep the Zod records and add a regression that hydrates a PR #3 `visualizer.workspace` payload (`strokes`, `ensemblyLedger`, `pulseMemory`, `workflowLessons`) without discarding it. `visualizer.workspace.v1` is a read-only fallback.
- [x] Point `read_pulse_memory`, `read_workflow_lessons`, `record_workflow_lesson`, and `append_ensembly_record` at those store helpers, return shallow copies, and unregister tools already registered if `registerTool` throws.
- [x] Rename the sample `card-log` copy to the Ensembly shared log. Leave `docs/decisions/001-ensembly-vs-vercel-board-sync.md` as it is on `main`. Keep `docs/decisions/002-chopin-interop-via-mcp.md`.

### Tail Plan

- [x] `docs/CRITICAL-FLOWS.md` CF-08 and the critical-flow tests.
- [x] `docs/TEST-SUITE.md` names the WebMCP tests and the persist regression.
- [x] `docs/ARCHITECTURE-LAYERS.md` links 001, 002, and 003, and keeps the fleet comparison.
- [x] This file keeps the PR #2 and PR #3 entries and appends the WebMCP, Chopin, and audit entries.
- [x] `.cursor/skills/verify-visualizer/` describes the strip with the sketch pad and the memory panel. The formal sync commit stays put.
- [x] `README.md` names the Ensembly shared log card. `@adaptate/core` and `@adaptate/utils` stay credited. The pull request body stays at or under 120 words.

## Canon 1 Ensembly pulse alignment

- **Chosen:** Keep Zod `^4.1.12` (already in `@visualizer/core`) as the Canon 1 checker for this cockpit. Emit `schema` and `format` as `pulse-pack-v1`. `coherence_milli` is a Zod integer `0..=1000`; a fractional number fails that schema, and a raw pack string whose number token contains `.`, an exponent, or `-0` is refused before `JSON.parse`. Legacy `ensembly-pulse-pack-v1` and `peram-pulse-pack-v1` stay readable through the existing float hash. `recordWorkflowLesson` writes an aux workspace update: same `stateVersion`, same railway phase, lesson still stored on `visualizer.workspace`. `canPromote` admits a non-superseded row when the outcome is confirmed, when `status` is `user-stated`, or when `status` is `tool-verified` and `verifyHash` equals `sha256:` plus the SHA-256 of the summary. `buildPulseInject` keeps at most 8 active traces and a 120-token budget, counting `ceil(utf-8-bytes / 4)`. No new package.
- **Why:** Canon 1 is the pack the alignment audit named. The workspace already validates with Zod, and `@adaptate/utils` already turns those objects into WebMCP input schemas. A second checker process would not change the cockpit store. Lessons are operational memory: they should remain visible and persisted without taking the human-pause path that `commitHuman` uses for a statement.
- **Basis:** Read on 2026-11-27, before this choice. [`PULSE-PACK-SPEC.md`](https://github.com/thecuriousts/ensembly/blob/master/docs/spec/PULSE-PACK-SPEC.md) (blob `2595494a673e2b88b1d1a570aec0652f4590635a`, status E2, 2026-11-13) is the only file under `docs/spec` besides `PULSE-READ.md` and `docs/spec/tla`. It names `format: pulse-pack-v1`, integer-only numbers, `coherence_milli` on trace `ext` (`0..=1000`), `kind`, `status`, `lock`, `verify_hash`, `prefetch_key`, and `superseded_by`, and it maps `ensembly-pulse-pack-v1` and `peram-pulse-pack-v1` on read. [`PULSE-READ.md`](https://github.com/thecuriousts/ensembly/blob/master/docs/spec/PULSE-READ.md) ranks a superseded row below its successor and uses `LIMIT ?`, not a fixed 8. The 8-trace cap is the limit already written in `docs/decisions/003-ensembly-pulse-alignment-audit.md` and in the earlier memory entry in this file. [Pulse instead of dump](https://captain.kingsparrow.space/articles/memory-issue) describes a return of roughly 120 verified tokens and does not name a tokenizer. The byte/4 count is a fixed estimate because that page and the spec do not name one. The Python checker and the Rust canon crate were not executed here.
- **Latest trends checked before choosing:** Yes, on 2026-11-27, before the code. The spec directory listing shows no Canon 2 file. Compared embedding `scripts/pulse/pulse_pack_check.py`, depending on a tokenizer package, and staying on the Zod already pinned here. Zod stays. `js-tiktoken` and `gpt-tokenizer` were not added; the spec's integer rule is a schema check, not a model tokenizer.

## Head Plan and Tail Plan for the Canon 1 slice

### Head Plan

- [x] Move `recordWorkflowLesson` off `commitHuman` onto an aux write that keeps the working phase and `stateVersion`, and prove that with a test.
- [x] Emit Canon 1 `pulse-pack-v1` (`schema`, `format`, integer `coherence_milli`, `traces`, `archive`, `host`, `kind`, `status`, `lock`, `verify_hash`, `prefetch_key`, optional `superseded_by`) and keep a read-only import of `ensembly-pulse-pack-v1`.
- [x] Admit `user-stated` and hash-backed `tool-verified` traces beside `confirmedOutcome`, drop superseded rows from the active pulse, and add `buildPulseInject` (8 traces, 120-token budget) on WebMCP and `MemoryPanel`.
- [x] Hydrate a PR #3 / PR #4 `visualizer.workspace` payload that has no Canon 1 fields, and reject a fractional `coherence_milli`.

### Tail Plan

- [x] Mark the three drifts resolved in `docs/decisions/003-ensembly-pulse-alignment-audit.md`. Link the Canon 1 pack from `docs/ARCHITECTURE-LAYERS.md`. Leave `001` and `002` untouched.
- [x] Update `docs/CRITICAL-FLOWS.md`, `docs/TEST-SUITE.md`, `README.md`, and `.cursor/skills/verify-visualizer/` for the aux lesson and the sparse inject. Leave the formal sync commit in place; note that lessons no longer call `commitHuman`.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`. Capture `ensembly-canon1-cockpit.png` and `ensembly-canon1-code-mode.png`.

## Review repair for the Canon 1 slice

- **Chosen:** Stay on the Zod checker, the aux lesson write, and `pendingTickStillApplies` already chosen above. No new package. Pack import reads admission fields from the payload and falls back to the trace envelope. A completed build tick keeps newer aux lessons and aux log lines. `promotePulse` takes the expected verify hash and matches it.
- **Why:** The review found tagged traces losing admission on import, and an in-flight tick dropping a lesson because the aux write does not move `stateVersion`. The hash check in Cypher was looser than `canPromote`.
- **Basis:** The review of `121e78b0` against the code in this repo, read on 2026-11-27 before the repair. The Canon 1 spec cited in the entry above is unchanged. No second checker was compared.
- **Latest trends checked before choosing:** No new tool. The Canon 1 trend check above still holds: Zod stays, and no tokenizer package is added.

### Head Plan

- [x] Restore `traceKind`, `status`, `lock`, `verifyHash`, `prefetchKey`, `supersededBy`, and `coherenceMilli` on pack import, with a tagged round-trip test.
- [x] Merge live aux lessons and aux log lines onto a completed build tick, with a mid-await regression.
- [x] Align `promotePulse` with the `canPromote` verify-hash rule and cover the inject edges.

### Tail Plan

- [x] Update the stale sentences in `docs/ARCHITECTURE-LAYERS.md`, `docs/CRITICAL-FLOWS.md`, `docs/TEST-SUITE.md`, and the verification notes. Leave decisions 001 and 002 and the formal sync commit in place.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`, then confirm CI `verify`.

## Headless MCP for outside SI agents

- **Chosen:** `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/client@2.4.0`, and `@modelcontextprotocol/node@2.1.2` in `apps/mcp`. `createMcpHandler` plus `toNodeHandler`, with `localhostHostValidation` and `localhostOriginValidation`, listening only on `127.0.0.1`. The tool list is the WebMCP bridge in `@visualizer/core`. State is a JSON file locked with `open(..., "wx")`. Writes require `VISUALIZER_MCP_ALLOW_WRITES=1` or a matching bearer. `@modelcontextprotocol/sdk` `1.32.2` was not added. No tokenizer package. Ledger, lesson, promotion, and pack import stay on the aux commit. `buildPulseInject` counts `JSON.stringify({ schema, traces })`. Pack hashing uses the in-repo `sha256Hex` so those helpers can sit on the main entry without `node:crypto` in the browser bundle.
- **Why:** Outside SI agents need the workspace tools without a browser tab, and a second process has to see the same records. v1 of the SDK is the maintenance line for the 2025-11-25 spec. v2 is the stable line for the 2026-07-28 spec and already ships the Streamable HTTP handler this server needs. The file lock stays in `node:fs` so the server does not take a second locking library. The token count has to describe the payload that enters a prompt and still fit in 120. A snippet count reported a smaller number than that JSON.
- **Basis:** Live research on 2026-11-27, before the package was added. `npm view` reported `@modelcontextprotocol/server` `2.4.0`, `@modelcontextprotocol/client` `2.4.0`, `@modelcontextprotocol/node` `2.1.2`, and `@modelcontextprotocol/sdk` `1.32.2`. The [sdk readme](https://www.npmjs.com/package/@modelcontextprotocol/sdk) says v1 is maintenance and v2 ships as `@modelcontextprotocol/server` and `@modelcontextprotocol/client`. The [HTTP serving guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/http) shows `createMcpHandler`, `toNodeHandler`, and the localhost host and origin guards. The dogfood note in the task is the source of the missing tools, the box-pack shape, the lesson loss, the pause, and the 97-versus-366 token gap. The byte/4 estimator stays the one already recorded in the Canon 1 entry.
- **Latest trends checked before choosing:** Yes, on 2026-11-27, before the install. Compared the v1 SDK `1.32.2` (maintenance, spec 2025-11-25, `StreamableHTTPServerTransport`) with the v2 server and client `2.4.0` (stable, spec 2026-07-28, `createMcpHandler`). v2 is the current line. A file lock from `node:fs` was compared with adding `proper-lockfile`; no lock package was added. `js-tiktoken` and `gpt-tokenizer` were not added; the Canon 1 entry already recorded that check.

## Head Plan and Tail Plan for the headless MCP slice

### Head Plan

- [x] Add `@visualizer/mcp` Streamable HTTP on `127.0.0.1`, with writes off by default, a JSON workspace file, and an end-to-end test that calls tools from a separate client process.
- [x] Register `start_build`, `resume_build`, `export_pulse_pack`, `import_pulse_pack`, and `promote_record`, and export `exportPulsePack`, `readPulsePack`, `recordsFromPack`, and `mergeLedger` from `@visualizer/core`.
- [x] Accept a `pulse-pack-v1` object that omits `ext`, compute a missing content hash, fall back to trace envelope fields, and keep the `tool-verified` hash check. Add a synthetic fixture.
- [x] Move `mergeAuxIntoTick` into core and call it from the page and from `runGuidedBuild`.
- [x] Keep ledger and lesson writes off the human-pause path. Count the serialized inject, drop duplicate entries when `inject` is set, and paginate ledger, lesson, and event-log reads.
- [x] Persist the local-write approval under `visualizer.webmcp.approval` and clear it when the toggle is off.

### Tail Plan

- [x] Update `docs/ARCHITECTURE-LAYERS.md`, `README.md`, `docs/CRITICAL-FLOWS.md`, `docs/TEST-SUITE.md`, `docs/decisions/004-headless-mcp.md`, and this file. Credit `@adaptate/utils` on the tool schemas. Leave the formal sync commit in place and update the formal note so it matches the aux ledger writes.
- [x] Update `.cursor/skills/verify-visualizer/` for the saved approval, the tool list, the promote behavior, and the headless server. Run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`.
- [x] After review: merge ledger and pulse rows in `mergeAuxIntoTick`, shorten the file lock, and record the file mode, host refusal, and concurrent append in `docs/CRITICAL-FLOWS.md`.

## Headless MCP review fixes

- **Chosen:** Keep the `node:fs` `wx` lock. The lock file stores pid and `/proc/<pid>/stat` start time, and a waiter removes it only when that owner is dead. The lock wraps load, `mergeAuxIntoTick`, and save, including ledger and pulse rows by id. The workspace file and lock are mode `0600`. The parent directory is mode `0700`. `VISUALIZER_MCP_STATE` must resolve inside `VISUALIZER_MCP_STATE_ROOT` unless `VISUALIZER_MCP_ALLOW_STATE_PATH=1`.
- **Why:** A tick that landed from an older snapshot was dropping ledger appends, promotions, and pack imports. A lock held across the awaited tick blocked the other writer, and a 30 second age check could drop a live owner's lock. The workspace file is local state and should not be world-readable.
- **Basis:** The review on pull request 6. No new package. `/proc/<pid>/stat` field 22 is the process start time on Linux, which is the CI host. This was not a fresh library lookup.
- **Latest trends checked before choosing:** No new library was compared. The earlier entry already checked `proper-lockfile` and left the lock on `node:fs`. That choice stays.

## Mermaid diagram check

### Head Plan

- [x] Rename the reserved flowchart id `graph` to `neo4jGraph` and point the memory edge at that id.
- [x] Parse every Mermaid fence in `README.md` and `docs/**` with `mermaid.parse`, and fail CI `verify` when a diagram does not parse.

### Tail Plan

- [x] Add `pnpm docs:mermaid`, record it in `docs/TEST-SUITE.md` and this file, and run the local suite before pushing.

- **Chosen:** `mermaid@12.4.0` via `mermaid.parse`, with `jsdom@31.0.1` so DOMPurify has a window in Node. The script is `scripts/verify-mermaid.ts`, exposed as `pnpm docs:mermaid`. `@mermaid-js/mermaid-cli@12.2.0` was not added.
- **Why:** GitHub rejected the architecture diagram because a node id was the reserved word `graph`. `mermaid.parse` is the library's parser entry and reports that same error. In Node, DOMPurify's default export has no `addHook` until a document exists, so the script creates a jsdom window before importing mermaid. A browser render would also parse the diagram, and it would download Chromium on every CI run.
- **Basis:** Live research on 2026-11-27, before the packages were added. `npm view mermaid version` returned `12.4.0` (published 2026-11-27). `npm view @mermaid-js/mermaid-cli version` returned `12.2.0`. `npm view jsdom version` returned `31.0.1`. A local `mermaid.parse` call on the old diagram threw `Parse error on line 3` with `got 'GRAPH'`. The renamed diagram, and the other two fences in `docs/ARCHITECTURE-LAYERS.md`, parse.
- **Latest trends checked before choosing:** Yes, on 2026-11-27, before the install. Compared `mermaid` `12.4.0` (`mermaid.parse`) with `@mermaid-js/mermaid-cli` `12.2.0` (Puppeteer render). The library line is newer than the CLI line. The check uses the library parser.

## Dynamic catalog and agent snapshot

- **Chosen:** Stay on `@ui-sdk/react` and `@ui-sdk/core` `0.1.0-beta.17`. Wire `createAgent().snapshot()` into the cockpit snapshot and `createAgent().act()` with `allow` returning false, so a control press is refused. Fleet writes use a new bridge tool `act` that files a pending proposal by action id. `snapshot` is the read. `@visualizer/mcp` picks both up from `webMcpToolNames`. The map is an in-repo Zod catalog checked with `parse` from `@adaptate/core` and `zodToOpenAPISchema` from `@adaptate/utils` on the tool input. No `@json-render/core`, no `@a2ui/react`, no chat UI runtime. Proposals are aux rows. `mergeAuxIntoTick` keeps them. Measured on the sample fleet with `ceil(utf-8 bytes / 4)`: snapshot 704 tokens, accessibility listing 853, HTML serialization 1144.
- **Why:** XState 6 already owns the railway. A second UI runtime would own a tree of its own. The agent needs ids it can name, and the page needs a spec that rejects unknown components and executable props. The published ui-sdk line is still `0.1.0-beta.17`, which already exports `createAgent`. A newer GitHub release was not on npm. The token gap is the fleet surface only, not a full browser accessibility tree of another app.
- **Basis:** Live research on 2026-11-27, before the catalog was written. `npm view @ui-sdk/react version` and `npm view @ui-sdk/core version` both returned `0.1.0-beta.17`. [Connect an agent](https://ui-sdk.dev/docs/agents/connect-an-agent) and the [reference](https://ui-sdk.dev/docs/agents/connect-an-agent/reference) document `createAgent`, `snapshot`, `act`, and `registerTools`. The installed `agent.d.ts` matches that `act({ steps })` shape. `npm view @json-render/core version` returned `0.23.2` (updated 2026-11-19). [json-render schemas](https://json-render.dev/docs/schemas) describe a catalog plus a generative spec, and [its A2UI page](https://json-render.dev/docs/a2ui) shows a second message format. `npm view @a2ui/react version` returned `0.16.1`, with peer `zod` `^3.25.76`. [A2UI v1.0](https://a2ui.org/specification/v1.0-a2ui/) (updated 2026-06-08) adds envelopes, `@path` bindings, and function RPC. This repo is on Zod 4. The Uncle Bob note was read as the task link `https://x.com/unclebobmartin/status/2123401950305660969`. Token counts were printed from `measureCockpitSurface(createSampleWorkspace())` on this branch.
- **Latest trends checked before choosing:** Yes, on 2026-11-27, before the code. Compared staying on ui-sdk `0.1.0-beta.17` (npm current) with the GitHub pre-release `@ui-sdk/react@0.1.0-beta.19` from the same day, which npm did not list. Compared `@json-render/core` `0.23.2`, `@a2ui/react` `0.16.1` against A2UI 1.0, and a small in-repo Zod renderer. The in-repo renderer matched one surface and the Zod 4 already pinned here. No catalog package was added.

## Head Plan and Tail Plan for the dynamic catalog

### Head Plan

- [x] Add the sample fleet graph, cycle / hotspot / orphan / dead-edge analysis, and aux proposals that do not change `stateVersion` or the graph.
- [x] Validate one Zod catalog with `@adaptate/core` `parse`. Reject unknown components, bad props, and executable keys.
- [x] Expose `snapshot` and `act` on the WebMCP bridge and through `@visualizer/mcp`. Writes stay off until local approval.
- [x] Render the map in the cockpit from that spec. `createAgent().snapshot()` is included. `createAgent().act()` is refused.
- [x] Keep a proposal that lands while a build tick is awaiting, via `mergeAuxIntoTick`.

### Tail Plan

- [x] Update the architecture diagram, `README.md`, `docs/decisions/005-dynamic-ui-catalog.md`, `docs/CRITICAL-FLOWS.md`, `docs/TEST-SUITE.md`, and this file. Credit `@adaptate/core` and `@adaptate/utils`.
- [x] Update `.cursor/skills/verify-visualizer/` for the map. Leave the formal sync commit in place and note that proposals are aux.
- [x] Run `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`.

## Review repair for the fleet catalog

- **Chosen:** Stay on the in-repo Zod catalog and on `mergeAuxIntoTick`. The spec fed to the renderer contains pending proposals only, and only the newest rows that fit under 80 elements. `buildFleetSpec` returns that spec. `readCatalogSpec` is what rejects it. The page shows that rejection and stays mounted. Proposal rows on a finished tick come from the live ledger. `act` reports the pending row it just appended. A duplicate pending action, an unknown proposal id, and an already decided id are errors. Catalog text is checked after control characters, whitespace, and numeric or colon entities are folded. A key matching `/^on[A-Z]/` is refused. Approval still only appends a memory log entry and increments `logSeq`.
- **Why:** Decided rows were still counted toward the 80-element cap, and a throw during render hid the rejection. A build tick never edits proposals, so the tick copy was restoring `pending` over a live approval. The first row with a given action id was an older rejection.
- **Basis:** The review of `0263e96` and the current source in `packages/core/src/fleet/catalog.ts`, `propose.ts`, `state/merge-aux.ts`, and `webmcp/bridge.ts`. No new package.
- **Latest trends checked before choosing:** No new library was in question. The catalog choice above already compared ui-sdk, json-render, and A2UI on 2026-11-27.

## Vendored library source

- **Chosen:** `git subtree add --squash` for two read-only trees, and no new package. `repos/xstate` is tag `xstate@6.0.0-beta.5` (`04b26b8670ec6724279764579a74043fb83960da`), the version already in `@visualizer/core`. `repos/adaptate` is `main` (`af194e4182f2477622c53dbdfc9193b433e31de8`). After the squash, `du -sb` reported 11,436,534 bytes and 2,341 files for XState, and 4,439,222 bytes and 456 files for adaptate. Both stay under 150 MB, so the full trees stay. `repos/**` is a pnpm workspace negation, an ESLint global ignore, a TypeScript `exclude`, a Vitest `exclude`, a Vite watch ignore plus `server.fs.deny`, and a skip in `scripts/vendor-paths.ts` used by `scripts/verify-mermaid.ts`. Editor search, watcher, file tree, and auto-import skip `repos/**`. Application imports stay on `xstate`, `@adaptate/core`, and `@adaptate/utils`.
- **Why:** Coding agents read source more reliably than a snippet from the web. `node_modules` is a poor copy because published files are built and agents are steered away from ignored directories. A submodule needs an extra init step. Effect itself is not a dependency of this repo, so that repository is not vendored. XState `main` is still v5, so vendoring `main` would teach the wrong major. Beta.6 is newer than the package this repo typechecks, so the tree matches the import.
- **Basis:** Live research on 2026-11-28, before the subtree commands. `git ls-remote` on `github.com/statelyai/xstate` showed `xstate@6.0.0-beta.6` (`fd16fbccdfed9d8a6ff944522e1ba0eb28e21638`) as the newest v6 tag and as `refs/heads/next`. A depth-1 clone of `main` had `packages/core/package.json` version `5.33.4`. The beta.5 tag's core `package.json` version was `6.0.0-beta.5`. `git ls-remote` on `github.com/p10ns11y/adaptate` `refs/heads/main` was `af194e4182f2477622c53dbdfc9193b433e31de8`. The subtree method is the one in [The One Weird Git Trick](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive) (updated 11 May 2026). Workspace negation is the `!` glob in [pnpm-workspace.yaml](https://pnpm.io/10.x/pnpm-workspace_yaml). ESLint global ignores are an `ignores` object with no other keys ([configuration files](https://eslint.org/docs/latest/use/configure/configuration-files)). Vite `server.watch` is passed to the file watcher, and setting `server.fs.deny` replaces the default list ([server options](https://vite.dev/config/server-options.html)), so the published defaults were kept and `**/repos/**` was added.
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the commands. Compared a submodule, a subtree, and leaving agents on web search. Subtree won for the reason in that post: the files are in the clone with no init step. Compared vendoring Effect, and did not, because this repo does not import it. Compared XState `main` (5.33.4), `xstate@6.0.0-beta.6` on `next`, and `xstate@6.0.0-beta.5`. The installed beta.5 tag is the reference. No second state-machine library was added.

### Head Plan

- [x] Confirm the live XState v6 ref. Upstream `main` is 5.33.4. Vendor tag `xstate@6.0.0-beta.5` and adaptate `main` with `git subtree add --prefix=repos/<name> <url> <ref> --squash`.
- [x] Keep `repos/` out of the pnpm workspace, typecheck, lint, Vitest, the Vite build and dev server, and the Mermaid walk. Add `.vscode/settings.json` excludes for search, the watcher, the file tree, and auto-import.
- [x] Add the Vendored repositories section to `AGENTS.md`, with the squashed `git subtree pull` command for each tree.
- [x] Write `agent-patterns/xstate-v6.md` and `agent-patterns/adaptate.md` from the vendored source and tests, including v5 patterns to avoid.

### Tail Plan

- [x] Update `README.md` References, including `@adaptate/core` and `@adaptate/utils`, and note that the architecture diagram does not gain an edge. Record the decision in `docs/decisions/006-vendor-library-source.md`.
- [x] Append this entry, including whether the choice came from live research. Note in `docs/TEST-SUITE.md` that the check commands do not enter `repos/`.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, `pnpm build`, and `pnpm docs:mermaid`. Pull request body at or under 120 words.
- [x] rebase onto main and renumber ADRs before review.

## Docs front page

- **Chosen:** Keep the README diagram in Mermaid, parsed by the existing `pnpm docs:mermaid` (`mermaid@12.4.0`). Compress the cockpit screenshot with `oxipng` `10.2.1` at `-o 4 --strip safe`. No new package. No palette quantizer.
- **Why:** The README is a short visual front page. Mermaid is already what CI parses, so a second diagram tool would split the check. The screenshot is a UI capture with flat color and soft gradients. A lossless optimizer keeps the pixels. A palette reduction can band those gradients.
- **Basis:** The Mermaid parser is the one already recorded in the Mermaid diagram check above (`mermaid` `12.4.0`, `npm view` on 2026-11-27). oxipng: the [10.2.1 release](https://github.com/oxipng/oxipng/releases/tag/v10.2.1) and the [oxipng README](https://github.com/oxipng/oxipng) example `oxipng -o 4 --strip safe`. [Encode Wiki, PNG](https://encode.wiki/codecs/images/png) recommends oxipng for lossless recompression and pngquant when a palette is acceptable. [Image Load Lab, 18 Oct 2026](https://imageloadlab.com/oxipng-optimization-levels/) measured oxipng 10.2.1 and found `-o 2` did most of the work on screenshots, with `-o 4` a small extra saving. This asset is written once, so `-o 4` matches the oxipng README example.
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the screenshot was compressed. Compared oxipng 10.2.1 (lossless) with pngquant (palette, lossy). oxipng won for a cockpit capture. A newer Mermaid major was not adopted; CI already pins `12.4.0`. pnpm printed an upgrade notice to `12.23.0`; this step stays on the pinned `10.33.4`.

### Head Plan

- [x] Shorten `README.md` to one description line, one hero screenshot, one Mermaid diagram, the run command, links into `docs/`, and the `@adaptate/core` / `@adaptate/utils` credit. Remove the three SVG diagrams that only the README used.
- [x] Fold the lock table and neighbor notes into `docs/ARCHITECTURE-LAYERS.md`. Fix the memory facts in `docs/MEMORY-NEO4J.md` against `canPromote`. Light-trim decisions 001 and 002. Add the two rules to `AGENTS.md` and point `agent-patterns/` at the same read order.

### Tail Plan

- [x] Relative link check over `README.md`, `docs/**`, `AGENTS.md`, and `agent-patterns/**` (37 links, all resolved). `pnpm docs:mermaid` reports four diagrams.
- [x] Run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`. Pull request body at or under 120 words.

## Restored SVG diagrams

- **Chosen:** Restore the three SVG files from `966ce02` with `git checkout 966ce02d50849a76014ba09723475266798b67fc -- docs/diagrams/`. Embed `architecture-cockpit.svg` and `pilot-flow.svg` in `README.md` with relative image paths. Embed `fallback-tiers.svg` in `docs/ARCHITECTURE-LAYERS.md` beside the three-tier lock. Keep `pnpm docs:mermaid` (`mermaid@12.4.0`) for the Mermaid fences that remain in `docs/`. No new package. No Mermaid CLI render step.
- **Why:** The owner asked to bring those drawings back. They are hand-drawn SVG, not Mermaid source, so a renderer would replace the picture. GitHub shows a committed SVG from a path relative to the Markdown file. The README stays a short front page: title, one line, the cockpit shot, two diagrams, then the run steps, docs links, and references.
- **Basis:** Live lookup on 2026-11-28, before the files were embedded. [GitHub Docs, basic writing and formatting syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) says a relative image path is resolved from the current file, and a path that starts with `/` is from the repository root. [GitHub Docs, working with non-code files](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files) lists SVG among displayed image formats and says SVGs do not support inline scripting or animation. The restored files use an inlined system font stack and contain no script.
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the checkout was embedded. Compared three options. A Mermaid fence stays easy to edit and is what `pnpm docs:mermaid` parses, and it is the drawing PR #9 put on the README. [Boring Utils, 22 Oct 2026](https://boringutils.com/guides/charts-in-github-readme) says to commit an SVG or PNG and link it with a relative path when the picture must look the same in every viewer, and to keep Mermaid for a simple chart you edit as text. [MermaidViewer](https://mermaidviewer.net/guides/mermaid-in-github-markdown) describes exporting Mermaid to SVG when GitHub's Mermaid build lags. That export path was not used: these three files are the authored drawings named in the request, not a Mermaid export. Mermaid stays on the three fences in `docs/ARCHITECTURE-LAYERS.md`.

### Head Plan

- [x] Restore `docs/diagrams/architecture-cockpit.svg`, `docs/diagrams/pilot-flow.svg`, and `docs/diagrams/fallback-tiers.svg` from `966ce02`.
- [x] In `README.md`, replace the Mermaid flowchart with `architecture-cockpit.svg`, then `pilot-flow.svg`. Keep the title, the one-liner, `docs/hero-cockpit.png`, the run section, the docs links, and the `adaptate` credit.
- [x] Place `fallback-tiers.svg` beside the three-tier lock in `docs/ARCHITECTURE-LAYERS.md`.
- [x] Point the `laptop-1` sentence in `.cursor/skills/verify-visualizer/features/tier-fallback-local-model.md` at `docs/TECH-CHOICES.md`, where that host alias is written. Use the alias only.

### Tail Plan

- [x] Append this entry. Relative link and image check over `README.md`, `docs/**`, `AGENTS.md`, `agent-patterns/**`, and `.cursor/skills/**` (27 files, 50 relative links, 4 images, all resolved). `pnpm docs:mermaid` reports three diagrams.
- [x] Run `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`. Pull request body at or under 120 words. Do not edit `repos/`.

## Local library refs

- **Chosen:** Keep `repos/.gitkeep` as the only tracked path under `repos/`. Ignore `repos/*` except that file. `scripts/fetch-ref.sh` is bash with `set -euo pipefail`. One case table pins `xstate` to `https://github.com/statelyai/xstate` at tag `xstate@6.0.0-beta.5` and `adaptate` to `https://github.com/p10ns11y/adaptate` at branch `main`. The script runs `git clone --depth 1 --branch <ref>` into `${XDG_CACHE_HOME:-$HOME/.cache}/visualizer-refs/<lib>` and symlinks `repos/<lib>` to that directory. A second run exits 0 without cloning when that checkout is already on the pin and the symlink already points at it. No new package.
- **Why:** The tracked trees were 2,798 files and 15,875,756 bytes. The app imports `xstate`, `@adaptate/core`, and `@adaptate/utils`. CI never reads `repos/`. A cache clone exists only when a reader asks for it.
- **Basis:** Live lookup on 2026-11-28, before the script was written. [git-clone](https://git-scm.com/docs/git-clone) (manual text unchanged from 2.54.1 through 2.56.1; the command used here was git 2.43.0) says `--branch` accepts a tag and detaches HEAD, and `--depth` truncates history. [XDG Base Directory Specification 0.8](https://specifications.freedesktop.org/basedir/latest/) says `$XDG_CACHE_HOME` holds non-essential cached data, and an unset or empty value means `$HOME/.cache`. [ShellCheck 0.11.0](https://github.com/koalaman/shellcheck/releases/tag/v0.11.0) (2025-08-03) is the current release. This change ran that binary and the distro 0.9.0 binary; both exited 0.
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the script. Compared leaving the trees in git, a submodule, and a depth-1 clone in the XDG cache. The cache clone fits because a normal checkout and CI do not need the files. ShellCheck 0.11.0 over `bash -n` alone, because the script has to pass a current linter. pnpm stayed on the pinned `10.33.4`; the installer printed an upgrade notice to `12.23.0` and this step did not take it. No second state-machine library was added.

### Head Plan

- [x] Remove `repos/xstate` and `repos/adaptate` from the index. Track `repos/.gitkeep` only. Ignore every other `repos/` path.
- [x] Add executable `scripts/fetch-ref.sh` with the pin table, the depth-1 clone, and the symlink. An unknown lib or no argument prints usage on stderr and exits non-zero.
- [x] Point `AGENTS.md` at that script. Update the other docs that told readers to keep the trees in git. The CI workflow does not call the script.

### Tail Plan

- [x] Update `README.md` references, `docs/ARCHITECTURE-LAYERS.md`, `docs/TEST-SUITE.md`, `agent-patterns/xstate-v6.md`, `agent-patterns/adaptate.md`, and decisions 006 and 007. README and docs already name the host alias `laptop-1` or the loopback `127.0.0.1`.
- [x] Append this entry.
- [x] Run `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build` on a tree whose `repos/` holds only `.gitkeep`. Each exited 0.

## Bare shell

- **Chosen:** Keep Vite `^7.1.3` with `@vitejs/plugin-react` `^5.0.2` and React `^19.1.1` for one empty screen. Do not move to Vite `8.4.0` in this step. Drop `@ui-sdk/react`, `@ui-sdk/core`, `perfect-freehand`, the font packages, and `neo4j-driver`. Keep `xstate@6.0.0-beta.5`, `@adaptate/core@3.0.0`, and `@adaptate/utils@3.0.0`. The screen schema is checked with `parse` from `@adaptate/core/result` and described with `zodToOpenAPISchema` from `@adaptate/utils`. Model-based paths still come from `getSimplePaths`.
- **Why:** The page is one render. The railway checks already run on XState 6. A bundler major, and the UI SDK, belong to later steps. The removed packages belonged to the screen this step deletes.
- **Basis:** Lookup on 2026-11-28, before the shell was written. `npm view vite version` returned `8.4.0`. `npm view react version` and `npm view react-dom version` returned `19.3.1`. [Vite 8.4](https://vite.dev/blog/announcing-vite8-4) (2026-11-26) and the [Getting Started](https://vite.dev/guide/) page still scaffold React with `pnpm create vite` and the `react-ts` template. The npm page listed `latest` as `8.4.0` and `previous` as `6.4.6`.
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the shell was written. Compared staying on the installed Vite 7 line, moving to Vite 8.4 (Rolldown, published 2026-11-26), and adding a new renderer. Vite 8.4 is current. This step keeps Vite 7 because the screen does not need the Rolldown build or the experimental SSR mode in that release. React 19.3.1 is current. The existing `^19.1.1` range already accepts it, and this step does not bump that range. ui-sdk stays out until a later step wires views.

### Head Plan

- [x] Delete the old screen, the MCP app, memory, fleet, brain, and the Neo4j compose file.
- [x] Retarget model-based paths and the lockstep onto the stand-in.
- [x] Render one empty screen and replace both critical-flow tests.

### Tail Plan

- [x] Rewrite the three short docs, the verification skills, and this entry.
- [x] Run `pnpm docs:mermaid`, `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build`.

## Flow graph

- **Chosen:** Stay on `xstate@6.0.0-beta.5`. One `setup().createMachine` owns stage and mode with object transitions. `pnpm test:mbt` still generates paths with `getSimplePaths` from `xstate/graph` and checks them against `applyFlowEvent`. `getAdjacencyMap` lists every transition. `pnpm verify:formal` still runs `xstate validate` and `xstate test`, then `checkFlowGraph`. The path runner stays in this repo. The pin stays at `6.0.0-beta.5`.
- **Why:** The flow graph is a finite machine. The repo, `scripts/fetch-ref.sh`, and the formal command already run on beta.5. Beta.6 adds schema sampling, durable inspection, and rejection types this step does not use. `@xstate/test` walks paths with fast-check. This repo already executes the paths itself. Simple paths omit the two edges that return to the initial state. The adjacency map names those edges, and the test takes each one from a simple path that has reached its source.
- **Basis:** Lookup on 2026-11-28, before the machine was written. `npm view xstate dist-tags` reported `latest` `5.33.4` and `beta` `6.0.0-beta.6`. The [beta.6 release](https://github.com/statelyai/xstate/releases/tag/xstate%406.0.0-beta.6) (2026-11-27) lists those three additions. [Model-based testing](https://stately.ai/docs/xstate/v6/model-based-testing) documents `getSimplePaths`, `getAdjacencyMap`, and `@xstate/test` `testPaths`. [The agent guide](https://stately.ai/docs/xstate/v6/agents) documents `xstate test` reachability on supplied events. `npm view @xstate/test dist-tags` reported `beta` `2.0.0-beta.3`. The installed beta.5 graph run listed 58 transitions and 1002 simple paths, with 2 edges absent from those paths.
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the machine was written. Compared XState `5.33.4` (`latest`), `6.0.0-beta.6` (`beta`), and staying on `6.0.0-beta.5`. Compared `@xstate/test@2.0.0-beta.3` plus fast-check with the in-repo `getSimplePaths` runner. No second state-machine library was added. pnpm printed an upgrade notice to `12.23.0`. This step stays on the pinned `10.33.4`.

### Head Plan

- [x] One machine owns stage and mode, with Start, Pause, Stop, and the mode toggle.
- [x] The event log starts empty and records only events the machine takes.
- [x] Formal checks and model-based paths target this machine.

### Tail Plan

- [x] Update the three short docs, both verification skills, this entry, and the formal sync commit.
- [x] Save `step-2-wide` and `step-2-narrow`.

## View map on ui-sdk

- **Chosen:** `@ui-sdk/react` and `@ui-sdk/core` pinned to `0.1.0-beta.19`, with a pnpm override so both resolve to that version. React stays on `^19.1.1`. `@types/react` is `19.3.3` and `@types/react-dom` is `19.3.0`. The view map lives in `@visualizer/core` and names `stage-mark`, `button`, and `collapsible`. The web app renders those with `Button` and `Collapsible` from `@ui-sdk/react`, plus one `definePrimitive` whose controlled key is `stage`. `createAgent({ allow })` runs before render. `registerTools` publishes `snapshot`, `act`, and `query` when `document.modelContext.registerTool` is a function. The same allow list is component actions only, and it refuses `stage-mark`. When `registerTool` is missing, the page calls the bridge methods. Starter CSS from `@ui-sdk/core/web.css` is not imported.
- **Why:** The library renders component behavior. It does not map `(mode, stage)` to a layout, so that map stays here. Beta.19 is the version this step names, and it is the current `beta` dist-tag. The peer floor is React 19 and `@types/react` `>=19.2.10`. A page-sized primitive would hide the shipped components. `snapshot` reads keys listed in `controlled`, so `stage` is one of those keys and the primitive lists no actions. The later panel is a collapsible, present only for `advanced`. Leaving the starter stylesheet out keeps the screen's own overflow rules.
- **Basis:** Lookup on 2026-11-28, before the packages were added. `npm view @ui-sdk/react dist-tags` reported `latest` `0.1.0-beta.17` and `beta` `0.1.0-beta.19` (published `2026-11-27T21:24:54.863Z`). The same tags and time held for `@ui-sdk/core`. `npm view @ui-sdk/react@0.1.0-beta.19 peerDependencies` reported `react` `>=19`, `react-dom` `>=19`, `@types/react` `>=19.2.10`, and `@ui-sdk/core` `^0.1.0-beta.19`. `npm view react version` and `npm view react-dom version` returned `19.3.1`. `npm view @types/react version` returned `19.3.3`. `npm view @types/react-dom version` returned `19.3.0`, and `@types/react-dom@19.3.0` peers `@types/react` `^19.3.0`. `@types/react@19.2.10` exists. `@types/react-dom@19.2.7` peers `@types/react` `^19.2.0`. [Define a Primitive](https://ui-sdk.dev/docs/core/kernel/define-a-primitive) documents `definePrimitive`, `controlled`, and `createParts`. [Agent reference](https://ui-sdk.dev/docs/agents/connect-an-agent/reference) documents `createAgent`, `snapshot`, `act`, `query`, and `registerTools`, and says custom snapshot keys come from `controlled`. [WebMCP](https://ui-sdk.dev/docs/agents/connect-an-agent/webmcp) says registration does nothing without `document.modelContext.registerTool`. The React component list at [ui-sdk for React](https://ui-sdk.dev/docs/react/llms.txt) names `Button` (`@ui-sdk/react/button`) and `Collapsible` (`@ui-sdk/react/collapsible`).
- **Latest trends checked before choosing:** Yes, on 2026-11-28, before the install. Compared the npm `latest` tag `0.1.0-beta.17` with the `beta` tag `0.1.0-beta.19`. Beta.19 is the newer published line and the pin this step requires. Compared `@types/react` `19.2.10` (the peer floor) with `19.3.3` (current) paired with `@types/react-dom` `19.3.0`. The current pair satisfies `>=19.2.10`. React `19.3.1` is current. The existing `^19.1.1` range already accepts it, and this step does not bump that range. No second component runtime was added. The installer printed an upgrade notice to pnpm `12.23.0`. This step stays on the pinned `10.33.4`.

### Head Plan

- [x] One typed spec for every mode and stage. Advanced adds a later panel.
- [x] One `stage-mark` primitive exposes `stage` to `snapshot`.
- [x] `createAgent` and `registerTools` expose `snapshot`, `act`, and `query`. Without `registerTool`, call the bridge.

### Tail Plan

- [x] Update the three short docs, the verification skill, this entry, and the screen shots.
- [x] Leave the formal sync commit where it is.

