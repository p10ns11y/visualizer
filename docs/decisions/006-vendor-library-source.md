# 006 Vendored library source

- **Date:** 2026-11-28
- **Status:** Accepted

## Decision

Vendor two read-only trees with `git subtree add --squash`, and add no package.

| Tree | Remote | Ref | Commit | Checkout |
| :--- | :--- | :--- | :--- | :--- |
| `repos/xstate` | `https://github.com/statelyai/xstate.git` | `xstate@6.0.0-beta.5` | `04b26b8670ec6724279764579a74043fb83960da` | 11,436,534 bytes, 2,341 files |
| `repos/adaptate` | `https://github.com/p10ns11y/adaptate.git` | `main` | `af194e4182f2477622c53dbdfc9193b433e31de8` | 4,439,222 bytes, 456 files |

The XState checkout is large for a review and far under 150 MB, so the full tree stays. Coding agents read it, and the app keeps importing `xstate@6.0.0-beta.5`. `@adaptate/core` and `@adaptate/utils` stay the imported packages. `repos/` is not a workspace package, not a typecheck root, not a lint root, not a test root, and not part of the Vite or Mermaid walks.

## Why

A coding agent that only has a web snippet guesses the authoring style. Published `node_modules` copies are built output, and agents are steered away from ignored directories. A subtree puts the source in the clone without a submodule init step.

Live tags on 2026-11-28: XState `main` is `5.33.4`. The newest v6 tag is `xstate@6.0.0-beta.6` on `next`. This repo already depends on `6.0.0-beta.5`, so the vendored tree is that tag. Effect is not imported here, so the Effect repository is not vendored. The method is the subtree flow in [The One Weird Git Trick](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

## What stays closed

Nothing under `repos/` is edited in this repo. Nothing under `repos/` is imported. The architecture diagram does not gain an edge. A newer XState v6 tag is a later subtree pull with that tag, not a pull of `main`.
