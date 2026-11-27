# 003 Ensembly pulse alignment audit

- **Date:** 2026-11-27
- **Status:** The three drifts below are resolved in the Canon 1 slice. The comparison itself is unchanged.

## What was compared

`visualizer`'s two-layer memory (Ensembly ledger, Pulse Memory, workflow lessons) was compared on 27 Nov 2026 with:

- [Pulse instead of dump](https://captain.kingsparrow.space/articles/memory-issue)
- [Archive is not memory](https://captain.kingsparrow.space/articles/memory-issue/archive-not-memory)
- [HITL and HOOTL](https://captain.kingsparrow.space/articles/hitl-hootl)
- [`thecuriousts/ensembly` `PULSE-PACK-SPEC.md`](https://github.com/thecuriousts/ensembly/blob/master/docs/spec/PULSE-PACK-SPEC.md)
- `crates/ensembly-memory` in that same repository

## What matches

Sparse, portable, high-barrier verified decisions and mistakes line up with Ensembly pulse admissions and `pulse-pack-v1`. SI-maintained operational memory lines up with HOOTL, with skills, and with `crates/ensembly-memory`: that crate remembers and learns, and it never decides.

## Three nuances

1. Pulse is a sparse retrieval traffic contract: about 120-token verified snippets, at most 8 items, with a high-barrier lock against overwrite. Memory is any admitted trace likely to change the next action. Universal rules are a policy subset inside that memory, not a separate store.
2. Admission uses Ensembly tags. `kind` is `data`, `context`, `fact`, or `memory`. `status` is `user-stated`, `tool-verified`, `inferred`, or `unknown`. The record also carries `lock`, `verify_hash`, `prefetch_key`, and `superseded_by`. A non-empty `confirmedOutcome` is not the whole admission rule.
3. Ensembly separates four stores: the T1 ops ledger (authorize, claim, complete), Pulse-memory SQLite, the aux episodic CRDT in `crates/ensembly-memory`, and the life-os vault.

## Tracked drift

These three were open when this note was first recorded. The Canon 1 slice resolves each one.

1. Resolved. `recordWorkflowLesson` writes through the aux layer in `packages/core/src/memory/commit.ts`. A lesson during a working phase stays in that phase and does not change `stateVersion`. The lesson remains on `visualizer.workspace`, in the Memory panel, and on `record_workflow_lesson`.
2. Resolved. `packages/core/src/memory/ensembly.ts` emits Canon 1 `pulse-pack-v1` (`schema` and `format`) with integer `coherence_milli`. Zod rejects a fractional milli. A raw pack string rejects a float token. `ensembly-pulse-pack-v1` and `peram-pulse-pack-v1` stay readable and are not rewritten. The field list is in [`docs/ARCHITECTURE-LAYERS.md`](../ARCHITECTURE-LAYERS.md).
3. Resolved. `canPromote` admits a confirmed outcome, a `user-stated` trace, and a `tool-verified` trace whose `verify_hash` matches the summary. `superseded_by` removes a row from the active pulse. `buildPulseInject` keeps at most 8 traces inside the 120-token budget and is available as `read_pulse_inject` and as `inject` on `read_pulse_memory`.
