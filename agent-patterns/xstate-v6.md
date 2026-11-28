# XState v6 patterns

Read this note first (tag `xstate@6.0.0-beta.5`, tree `repos/xstate`). Only if this note does not answer, run `scripts/fetch-ref.sh xstate`. Do not run a broad search in `repos/`. Import from `xstate`. Never edit files under `repos/`. Never import from `repos/xstate`. Upstream `main` is v5. The contracts below are from `repos/xstate/docs/agents.md`, `repos/xstate/docs/testing.md`, `repos/xstate/docs/xstate-v5-to-v6.md`, and `repos/xstate/packages/core/test/runtimeValidation.test.ts`.

## Machine setup

Declare the contract in `setup({ schemas })`, then `createMachine`. A static transition is an object. This is the shape already used by `packages/core/src/railway/pilot.ts`:

```ts
import { setup } from "xstate";
import { z } from "zod";

const machine = setup({
  schemas: {
    events: {
      START: z.object({}),
      FAIL: z.object({ reason: z.string() }),
    },
  },
}).createMachine({
  id: "pilot",
  initial: "idle",
  states: {
    idle: { on: { START: { target: "planning" } } },
    planning: { on: { FAIL: { target: "failed" } } },
    failed: { type: "final" },
  },
});
```

`types<T>()` is inference only. It does not validate input. Runtime checks use a Standard Schema plus `standardSchemaValidator()` from `xstate/validation`, which `repos/xstate/docs/typescript.md` marks experimental:

```ts
import { standardSchemaValidator } from "xstate/validation";

setup({
  validator: standardSchemaValidator(),
  schemas: { input: z.object({ count: z.number() }) },
});
```

`repos/xstate/packages/core/test/runtimeValidation.test.ts` is the behavior: invalid input throws before the context factory runs.

`setup({ states })` can carry structural defaults (state type, id, initial). See `repos/xstate/packages/core/test/setupStateContracts.test.ts`.

## Transitions, context, and effects

A conditional transition is one function. Return `undefined` before any `enq` call to refuse the event. A context update is a shallow patch. Keep I/O, clocks, and randomness out of the calculation. Queue them with `enq`.

```ts
on: {
  INC: ({ context }) => ({
    context: { count: context.count + 1 },
  }),
}
```

Pure calculation does not start an actor. `initialTransition` and `transition` each return a `[snapshot, actions]` tuple. That is what `reducePhase` in the pilot railway uses.

## Actors

Invoke work that must stop when the state exits. Use `enq.spawn` when the actor should outlive that state. Async logic is `createAsyncLogic({ run })`. In tests, replace a boundary with `machine.provide({ actors })` and leave the states alone. `repos/xstate/docs/testing.md` shows `createAsyncLogic({ run: async () => ({ id: "ch_1" }) })` inside `provide`.

A child completion event is the category type plus `matches`, not a suffixed type:

```ts
on: {
  "xstate.done.actor": {
    matches: { actorId: "job" },
    target: "complete",
  },
}
```

Name a registry entry `registryKey` and look it up with `system.get(registryKey)`.

## Typing

Event types come from `schemas.events`. `actor.send({ type: "START" })` still works. `actor.trigger.START()` is the typed sender generated from those schemas. Pass implementations through `setup` or `machine.provide`. `machine.sources` is the implementation map.

## Testing

From `repos/xstate/docs/testing.md`:

```ts
const actor = createActor(machine).start();
actor.send({ type: "START" });
actor.getSnapshot().matches("planning");
```

Also assert the events the machine ignores. For a pure path, destructure `[snapshot] = transition(machine, snapshot, event)` and do not call `start`. `waitFor(actor, predicate, { timeout })` always receives a timeout. Move time with `new SimulatedClock()` and `clock.increment(ms)`. Restore a checkpoint with `restoreActor` from `xstate/persist` after `JSON.parse(JSON.stringify(actor.getPersistedSnapshot()))`. `createActor` does not take `snapshot`.

`xstate/graph` generates paths. This repo runs them in `pnpm test:mbt`. `getSimplePaths` does not execute the path by itself.

## Avoid (v5)

These are not v6 authoring syntax, or they no longer exist. The quick reference is `repos/xstate/docs/xstate-v5-to-v6.md`. Diagnostics live in `repos/xstate/packages/core/test/v5ConfigDiagnostics.test.ts`. `repos/xstate/docs/agents.md` is the authoring rule.

- `assign`, `raise`, `sendTo`, `sendParent`, `emit`, `spawnChild`, and `enqueueActions`. Return a patch or call `enq`.
- String targets (`START: "planning"`) and transition arrays are not v6 authoring syntax. The `string-targets` codemod wraps a bare string as `{ target: "..." }`. Write that object, or one function.
- `cond`, an object-form `guard`, `services`, `activities`, and `devTools`.
- `createMachine(config, implementations)` and `types: {} as { ... }`.
- `fromPromise`, `fromCallback`, `interpret`, and `systemId`.
- `createActor(machine, { snapshot })`. Use `restoreActor`.
- `on: { "xstate.done.actor.job": ... }`. Suffixed lifecycle types never match.
