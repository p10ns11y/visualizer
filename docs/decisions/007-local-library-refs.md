# 007 Local library refs

- **Date:** 2026-11-28
- **Status:** Accepted
- **Supersedes:** [006](006-vendor-library-source.md)

## Decision

Do not store `repos/xstate` or `repos/adaptate` in git. `repos/.gitkeep` is the only tracked path under `repos/`. Other paths there are ignored.

`scripts/fetch-ref.sh <lib>` shallow-clones one pinned ref into `${XDG_CACHE_HOME:-$HOME/.cache}/visualizer-refs/<lib>` and symlinks `repos/<lib>` to that clone. A second run is a success with no clone when that checkout and symlink are already on the pin.

| Lib | Remote | Ref |
| :--- | :--- | :--- |
| `xstate` | `https://github.com/statelyai/xstate` | `xstate@6.0.0-beta.5` |
| `adaptate` | `https://github.com/p10ns11y/adaptate` | `main` |

The app imports `xstate`, `@adaptate/core`, and `@adaptate/utils`. It does not import `repos/`. CI does not run the script.

## Why

The tracked trees were 2,798 files and 15,875,756 bytes. `agent-patterns/<lib>.md` answers the usual question. A local depth-1 clone is enough when that note does not.

## What stays closed

Nothing under `repos/` is edited. Nothing under `repos/` is imported. The architecture diagram does not gain an edge. A newer XState v6 tag is a pin change in `scripts/fetch-ref.sh`. Do not point `xstate` at `main`.
