---
name: formal-verify-visualizer
description: "Formally check the Visualizer flow graph: every state reachable, no non-final deadlock, and a stale event cannot append a log line. Use when a change touches the flow machine, applyFlowEvent, stateVersion, or Pause."
---

# Formal verification for the flow graph

The promise: every stage, motion, and mode combination can be reached, no non-final state is a deadlock, and a stale `expectedVersion` never appends an event-log line. The log starts empty and records an event only when the machine takes it. The stored log keeps the latest 200 lines.

A break lets the screen show a stage the machine cannot reach, or lets a stopped click look like a real event. Run the check when any covered file changes.

## Covered code

Synced with commit `0503ab6b7ff3669ae1c9c2f2b4ccf504f808baae`. Move that hash forward only after `pnpm verify:formal` passes and the notes below still describe the code at that commit.

- `packages/core/src/flow/machine.ts` — `flowMachine`
- `packages/core/src/flow/apply.ts` — `createFlow`, `applyFlowEvent`, `flowCan`
- `packages/core/src/formal/flow-graph.ts` — `checkFlowGraph`
- `packages/core/src/formal/export-machine.ts` — `flowMachineJson`
- `packages/core/src/formal/flow.reach.checks.json`

The flow graph is the only state machine this check walks.

## How to run

From the repo root:

```sh
pnpm verify:formal
```

The command uses XState `6.0.0-beta.5` from `@visualizer/core`. It writes the machine with `machineToJSON`, then runs `xstate validate` and `xstate test` on `flow.reach.checks.json`, then `checkFlowGraph()`. Exit code `0` prints JSON with `"ok": true`. Any other result is a failure.

## What the tools cover

`xstate test` supplies Start, Pause, Stop, Reset, and the mode toggle, and asserts `reachable` for every state node in `flowStateIds`. A reachability miss means those representatives did not witness the state. It does not prove the state is unreachable under some other event list.

`checkFlowGraph` calls `getShortestPaths` and requires all 18 combinations of stage, motion, and mode. A non-final leaf with no transition, or a reached snapshot with no outgoing event, is a deadlock. Reset from `done` returns to asking, live, and simple. The mode region can still toggle at `done`. One stale Start must return `STATE_CONFLICT` and leave the log empty.

This check is not a TLA+ model. If a later change adds a TLA+ model of the same promise, read that result with `/statechart`.

`pnpm test:mbt` is a separate check. It calls `getSimplePaths` from `xstate/graph`, runs those paths on `applyFlowEvent`, and then takes any transition the simple paths skip because it returns to the initial state. A green model-based run does not replace this check, and a green flow-graph run does not replace the path walk.

## Reading a failure

A real bug names a property and a short counterexample. A missing combination fails as:

```json
{
  "property": "reachability",
  "detail": "reachable states ...",
  "counterexample": ["building|paused|advanced"]
}
```

A modeling error is a failure the product is not supposed to forbid. Do not drop a listed state to hide a missing transition. Update the model only when the product rule changed, then move the sync commit.

## Updating the check

When a change is supposed to alter one of these rules, update `flow.reach.checks.json` and `checkFlowGraph`, rerun `pnpm verify:formal`, and move the sync commit to the commit you just verified. When covered code changed and this skill was not updated with it, use `/maintain-formal-verification-skill` before trusting a pass.
