# Tech choices

Provenance for the steps on this branch. Each entry says what was chosen, why, whether that came from training-data recall or from a lookup, and whether wider trends were checked **before** the choice. A later lookup does not rewrite an earlier "no".

Future steps append an entry here in the same change. The rule lives in `AGENTS.md`, `docs/CRITICAL-FLOWS.md`, and `docs/TEST-SUITE.md`.

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
