---
name: formal-verify-visualizer
description: "Formally check Visualizer's stateVersion lock and human-pause safety on the XState 6 pilot railway. Use when a change touches applyPilotEvent, commitHuman, pauseRun, resumeRun, applyBuildTick, or the pilot machine."
---

# Formal verification for the Visualizer lockstep

The promise: a committed workspace write raises `stateVersion` by one, a stale `expectedVersion` never changes the workspace, an agent write cannot commit while the run is paused or after it has stopped in `completed` or `failed`, and every railway phase can reach a resting phase (`paused_by_human`, `completed`, or `failed`).

A break lets a person lose an edit or lets a stopped run keep writing. Run the check when any covered file changes.

## Covered code

Synced with commit `58c593d6053d64b063fbab040bcb2402d76257e0`. Move that hash forward only after `pnpm verify:formal` passes and the notes below still describe the code at that commit.

- `packages/core/src/state/store.ts` — `applyPilotEvent`, `commitHuman`, `commitView`, `pauseRun`, `resumeRun`, `assertCommit`
- `packages/core/src/bootstrap/run.ts` — `applyBuildTick`, `runSelfBootstrap`
- `packages/core/src/railway/pilot.ts` — `pilotMachine`, `reducePhase`
- `packages/core/src/formal/lockstep.ts` — `checkLockstep`
- `packages/core/src/formal/export-machine.ts` — `pilotMachineJson`
- `packages/core/src/formal/pilot.safe.checks.json`
- `packages/core/src/formal/pilot.fail.checks.json`

Ledger append, promotion, pack import, and workflow lessons write through the aux layer in `packages/core/src/memory/commit.ts`. They do not call `commitHuman`, so they do not pause a working phase or change `stateVersion`. Only `pauseRun` and a human edit or stroke do. Fleet proposals in `packages/core/src/fleet/propose.ts` use the same aux rule: `act` files a pending row and does not change `stateVersion` or the railway. Approving or rejecting a proposal appends a memory log entry and increments `logSeq`. `mergeAuxIntoTick` in `packages/core/src/state/merge-aux.ts` copies the live proposal ledger onto a completed build tick, because a build does not edit those rows, and it also copies ledger rows, pulse rows, lessons, and aux log lines. The page and `runGuidedBuild` both call it. `applyBuildTick` itself is unchanged, so this sync commit stays.

## How to run

From the repo root:

```sh
pnpm verify:formal
```

The command uses XState `6.0.0-beta.5` from `@visualizer/core`. It writes the machine with `machineToJSON`, then runs `xstate validate` and `xstate test` on the two checks files, then `checkLockstep()`. Exit code `0` prints JSON with `"ok": true`. Any other result is a failure. Do not treat a fingerprint cap as a failure by itself; the report includes `fingerprints` and `maxFingerprints`.

## What the tools cover

XState's bundled CLI checks the railway graph. `pilot.safe.checks.json` supplies every event except `FAIL` and asserts `never: ["#pilot.failed"]` plus `reachable` for `planning`, `running`, `drift_detected`, `paused_by_human`, `resuming`, and `completed`. `pilot.fail.checks.json` supplies `START`, `PLAN_READY`, and `FAIL`, asserts `never: ["#pilot.completed"]`, and asserts `reachable: ["#pilot.failed"]`. A reachability miss means those representatives did not witness the state. It does not prove the state is unreachable under some other event list.

`checkLockstep` calls the real functions. It walks a rest path for all eight phases, then breadth-first interleaves agent events (`START`, `PLAN_READY`, `DRIFT`, `CLEAR`, `COMPLETE`, `FAIL`), build ticks (`start`, `judge`, `engage`, `finish` on the Tier 1 router), human edit, pause, resume, and view toggle. Each action is tried with the current version and with a stale version. The search stops at `stateVersion` 8 or 1500 fingerprints. One run explored 1500 fingerprints and 40524 transitions without a violation, and the eight phase witnesses finished inside that bound. The search does not preempt `router.judge` while it is awaiting a model. It does not model two processes sharing one object without going through `expectedVersion`.

This check is not a TLA+ model. If a later change adds a TLA+ model of the same promise, read that result with `/statechart`.

WebMCP write tools in `packages/core/src/webmcp/bridge.ts` call `pauseRun`, `resumeRun`, `runGuidedBuild`, and the aux writers for lessons, ledger appends, promotion, and pack import. They do not change the covered functions, so the sync commit above stays. A stale `stateVersion` still returns `STATE_CONFLICT` before a write. External writes stay read only until local approval is on. That approval flag is outside this search. An aux write that matches the current version does not move `stateVersion` and does not pause the railway.

`pnpm test:mbt` is a separate check. It calls `getSimplePaths` from `xstate/graph` and executes those paths on the workspace. A green model-based run does not replace this lockstep check, and a green lockstep run does not replace the path walk.

## Reading a failure

A real bug names a property and a short counterexample in the code's words. The stale-write break, a version check that never fired inside `applyPilotEvent`, failed as:

```json
{
  "property": "stale-write rejection",
  "detail": "agent START (stale) committed from version 1 while current was 0",
  "counterexample": ["seed cockpit v0", "agent START (stale)"]
}
```

That was a scratch edit, reverted after the check caught it. The same command then passed.

A modeling error is a failure that the product code is not supposed to forbid. Examples: treating a same-mode `commitView` as a version bump (it returns the same state), treating `pauseRun` outside a working phase as a pause, or expecting the search to continue past `stateVersion` 8. Do not weaken a listed property to hide a real commit. Update the model only when the product rule changed, then move the sync commit.

## Updating the check

When a change is supposed to alter one of these rules, update the witness or the action list in `lockstep.ts`, update the checks JSON if the railway graph changed, rerun `pnpm verify:formal`, and move the sync commit to the commit you just verified. When covered code changed and this skill was not updated with it, use `/maintain-formal-verification-skill` before trusting a pass.
