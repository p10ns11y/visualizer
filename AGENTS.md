# Agent rules

## Head Plan and Tail Plan

Every change starts with two plans, and both are checked off before the change is called done.

- **Head Plan:** the implementation itself. Name the files, the commands, and the behavior that must pass.
- **Tail Plan:** the end-stage chores and the friction those chores usually cause. Update `README.md`, `docs/CRITICAL-FLOWS.md`, this file, and the References credit for [`adaptate`](https://github.com/p10ns11y/adaptate) when the change touches them. Update `.cursor/skills/verify-visualizer/` when a person can drive a changed flow, and `.cursor/skills/formal-verify-visualizer/` when `stateVersion`, human pause, or the pilot railway changes. Keep the pull request body at or under 120 words, write SI, and do not use the words demo or gate.

Reduce the usual friction: regenerate model-based paths from `getSimplePaths` instead of freezing a path list; do not move the formal sync commit unless the covered transition functions changed; run `pnpm typecheck`, `pnpm test`, `pnpm test:critical-flows`, `pnpm test:mbt`, `pnpm verify:formal`, and `pnpm build` before pushing.

## Critical flows

A pull request that adds or changes a user-facing flow must update all of the following in the same change:

- `docs/CRITICAL-FLOWS.md`
- the tests executed by `pnpm test:critical-flows`
- `.cursor/skills/verify-visualizer/` when a person can drive the flow
- `.cursor/skills/formal-verify-visualizer/` when the flow touches `stateVersion`, human pause, or the pilot railway

Run `pnpm test:critical-flows` and `pnpm verify:formal` before pushing that pull request. `verify` on CI runs both, and a red result blocks the merge.

Use `/maintain-verification-skill` when the verification map drifts from the screens. Use `/maintain-formal-verification-skill` when covered transition code changes without a fresh formal run.
