# Agent rules

## Head Plan and Tail Plan

Every change starts with two plans, and both are checked off before the change is called done.

- **Head Plan:** the implementation itself. Name the files, the commands, and the behavior that must pass.
- **Tail Plan:** the end-stage chores and the friction those chores usually cause. Update `README.md`, `docs/CRITICAL-FLOWS.md`, `docs/ARCHITECTURE-LAYERS.md` when the core, bridge, or UI boundary changes, `docs/TEST-SUITE.md` when a test command changes, this file, and the References credit for [`adaptate`](https://github.com/p10ns11y/adaptate) when the change touches them. Append a provenance entry to `docs/TECH-CHOICES.md` for every step: tools chosen, why they fit, the cited lookup, and the trend check from stage 2 of the one-step loop. Update `.cursor/skills/verify-visualizer/` when a person can drive a changed flow, and `.cursor/skills/formal-verify-visualizer/` when `stateVersion`, human pause, or the pilot railway changes. Keep the pull request body at or under 120 words, write SI, and do not use the words demo or gate.

Reduce the usual friction: regenerate model-based paths from `getSimplePaths` instead of freezing a path list; do not move the formal sync commit unless the covered transition functions changed; record the lookup that actually happened instead of marking trends as checked after the fact; run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build` before pushing.

## README

README stays a short visual front page.

## Library notes

Read `agent-patterns/<lib>.md` first. Only if that note does not answer, run `scripts/fetch-ref.sh <lib>`. Never edit files under `repos/`. Never import from `repos/`.

## One step at a time

Product work moves one step per pass. Do not batch the next product step into the current one. Finish the current step, run verification, report, and wait for review before starting the next step.

Every future step uses this loop, in order:

1. State the goal, the Head Plan, and the Tail Plan.
2. Choose the tech stack and tools from a current lookup. Check latest trends before choosing. Do not choose from unverified training-data recall. Append the choice, the fit, the citation, and the trend check to `docs/TECH-CHOICES.md`.
3. Implement that one step.
4. Run `pnpm test:mbt`, `pnpm test:critical-flows`, and `pnpm verify:formal`, then confirm CI `verify` is green. Do not start the next step while any of those is red or still running.

Entries already in `docs/TECH-CHOICES.md` stay as written, including the ones whose basis was training-data recall. This loop applies from the next step onward.

## Critical flows

A pull request that adds or changes a user-facing flow must update all of the following in the same change:

- `docs/CRITICAL-FLOWS.md`
- the tests executed by `pnpm test:critical-flows`
- `.cursor/skills/verify-visualizer/` when a person can drive the flow
- `.cursor/skills/formal-verify-visualizer/` when the flow touches `stateVersion`, human pause, or the pilot railway

Run `pnpm test:critical-flows` and `pnpm verify:formal` before pushing that pull request. `verify` on CI runs both, and a red result blocks the merge.

Use `/maintain-verification-skill` when the verification map drifts from the screens. Use `/maintain-formal-verification-skill` when covered transition code changes without a fresh formal run.

## Library checkouts

Read `agent-patterns/<lib>.md` first. Only if that note does not answer, run `scripts/fetch-ref.sh <lib>`. Never edit files under `repos/`. Never import from `repos/`. Application code keeps importing `xstate`, `@adaptate/core`, and `@adaptate/utils`.

`scripts/fetch-ref.sh` pins `xstate` to tag `xstate@6.0.0-beta.5` and `adaptate` to branch `main`. The clones live under `${XDG_CACHE_HOME:-$HOME/.cache}/visualizer-refs/` and are linked from `repos/<lib>`. Upstream XState `main` is XState 5. A newer v6 tag is a pin change in that script. CI does not run the script and does not need `repos/`.

## House source pins

`packages/sources/` holds the pinned house trees that liturgy reads. `packages/sources/PINS.tsv` lists each lib, URL, full commit, and subpath. `scripts/sync-sources.sh <lib>` copies that pin again. These trees are not workspace packages. Do not put them under `repos/`. `scripts/fetch-ref.sh` stays limited to `xstate` and `adaptate`.
