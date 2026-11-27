# Agent rules

## Critical flows

A pull request that adds or changes a user-facing flow must update all of the following in the same change:

- `docs/CRITICAL-FLOWS.md`
- the tests executed by `pnpm test:critical-flows`
- `.cursor/skills/verify-visualizer/` when a person can drive the flow
- `.cursor/skills/formal-verify-visualizer/` when the flow touches `stateVersion`, human pause, or the pilot railway

Run `pnpm test:critical-flows` and `pnpm verify:formal` before pushing that pull request. `verify` on CI runs both, and a red result blocks the merge.

Use `/maintain-verification-skill` when the verification map drifts from the screens. Use `/maintain-formal-verification-skill` when covered transition code changes without a fresh formal run.
