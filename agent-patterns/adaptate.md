# adaptate patterns

Read this note first (`@adaptate/core` and `@adaptate/utils` `3.0.0`, tree `repos/adaptate` at `main`). Only if this note does not answer, run `scripts/fetch-ref.sh adaptate`. Do not run a broad search in `repos/`. Import the packages. Never edit files under `repos/`. Never import from `repos/adaptate`.

The call site in this repo is `packages/core/src/shell.ts`. The implementations are `repos/adaptate/packages/core/src/result.ts`, `repos/adaptate/packages/core/src/index.ts`, `repos/adaptate/packages/core/src/stream.ts`, `repos/adaptate/packages/core/src/verify.ts`, and `repos/adaptate/packages/utils/src/openapi.ts`. Tests are `repos/adaptate/packages/core/src/__tests__/result.test.ts` and `verify.test.ts`.

## `parse` and `parseAsync`

`parse` from `@adaptate/core/result` takes a Standard Schema and a value and returns a `Result`. It does not throw on a schema failure.

```ts
import { parse } from "@adaptate/core/result";

const checked = parse(schema, input);
if (!checked.ok) {
  checked.error; // issues
} else {
  checked.value;
}
```

`map` and `flatMap` skip the error track. `recover` and `match` see both tracks (`result.test.ts`). If `schema["~standard"].validate` returns a promise, `parse` returns an error whose message says to use `parseAsync`. Use `parseAsync` for an async schema.

Zod objects in this repo are passed through a local cast to `StandardSchemaV1` before `parse` or `parseStream`. Keep that cast next to the call, as `asStandard` does in `adapt-call.ts`.

## `parseStream`

`parseStream(source, schema, partialSchema?)` yields `StreamStep` values. A chunk that is still open has `done: false`. The last step has `done: true`. An empty source and a source that ends before the JSON value closes are `done: true` with `result.ok === false`.

`isSettled(step, path)` from `@adaptate/core/stream-incremental` is false for a key still on `openPath`, and false for every path when the partial schema failed. Do not treat a partial step as the final document. The connector reader waits for `step.done`, then checks `isSettled` on the required keys, then runs `parse` again on the accepted value.

## `transformSchema` and conditional fields

`transformSchema` from `@adaptate/core` accepts a Zod object, and a top-level Zod array when the config has `'*'`. `true` makes that field required. `false` keeps it optional. A nested object walks the same way. `'*'` walks array elements. Any other schema throws `"The given schema must be a Zod object."`

`makeConditionalSchemaTransformer(data)` returns a function of `(schema, config)`. A field config `{ requiredIf: (row) => boolean }` unwraps that field when the predicate is true for `data`. `run()` parses `data` with the updated schema. `requireDriftNote` in `stream.ts` uses this so `note` is required only when `kind` is `"drift"`.

## Stream validators and OpenAPI

`createStreamValidator(schema, configs)` from `@adaptate/core/stream` returns `partial` and `final`. Each config name comes back as `{ valid, errors }`. `final` uses `safeParse` on the transformed schema. The connector call uses a `ready` config that marks `connectorId`, `workspaceVersion`, and `summary` required.

`zodToOpenAPISchema` from `@adaptate/utils` walks a Zod schema into an OpenAPI object, including `required`. A schema cycle throws `RangeError`. The screen schema in `packages/core/src/shell.ts` uses this converter. Do not hand-write a second JSON Schema for the same Zod object.

`verifyStream` from `@adaptate/core/verify` concatenates `Uint8Array` chunks and returns `{ ok: true, value }` or `{ ok: false }`. The test "concatenates chunks in memory and verifies before any disk write" is the contract: it does not write a file. Pass `size` and a hash when the manifest has them. A short stream fails closed.

## Avoid

- `schema.parse` when the caller needs the `Result` track. `parse` keeps the error. `schema.parse` throws.
- `JSON.parse` on one chunk of a stream. Use `parseStream` and `isSettled`.
- Reading `step.result.value` when `step.result.ok` is false, or when `done` is still false and the path is open.
- Calling `transformSchema` on a bare `ZodString`, or on a Zod array whose config has no `'*'`.
- Importing `repos/adaptate/packages/...` from application code.
