# 003 Ensembly pulse alignment audit

- **Date:** 2026-11-27
- **Status:** Recorded. The three drifts below are tracked for the next slice. This note does not change the store.

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

## Tracked drift for the next slice

These stay as they are in this pull request. The next slice resolves them.

1. `recordWorkflowLesson` runs through `commitHuman` and pauses an active build. Move that write to an SI-maintained aux layer.
2. `packages/core/src/memory/ensembly.ts` emits the legacy alias `ensembly-pulse-pack-v1` with a float `coherence`. Migrate to Canon 1 `pulse-pack-v1`: refuse floats, and use `coherence_milli`, hint tags, and `verify_hash`.
3. `canPromote` checks only `confirmedOutcome`. Add Ensembly tags, supersession through `superseded_by`, and sparse pulse retrieval at about 120 tokens with `LIMIT 8`.
