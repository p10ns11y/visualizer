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

- **Chosen:** Global install only: `npx --yes skills add statelyai/skills -a cursor -g -y --json`. On this VM the files landed in `/home/ubuntu/.agents/skills/` as `stately`, `state-management`, `xstate-v5`, `xstate-v6`, and `readme`. They are not in the repo and not in this cloud agent's skill catalog (`~/.agents/skills` is not on that catalog path).
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
