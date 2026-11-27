# WebMCP bridge

The WebMCP strip shows whether the page found native `modelContext` or is running the local bridge, and lists the registered tools. The same strip is visible with the freehand sketch pad and the memory panel in Visual Cockpit, and again in Code Mode.

## Sub-features

- `webmcp-status` shows `Local bridge` when `modelContext` is absent, or `Native WebMCP` when `document.modelContext` registered the tools.
- `webmcp-tools` lists `list_cards`, `read_workspace`, `read_pulse_memory`, `read_pulse_inject`, `read_workflow_lessons`, `pause_build`, `record_workflow_lesson`, and `append_ensembly_record`.
- `webmcp-approval` starts read only. `Allow local writes` is the control that turns local approval on.

## How to get to it (user POV)

- Open the preview. The strip sits under the header in Visual Cockpit.
- Read the heading `Local bridge` or `Native WebMCP`, and the tool names.
- Press `Code Mode`. The same strip stays on the page.
- The log card title on a fresh profile is `Ensembly shared log`.

## Driving it with verify-visualizer

Preconditions:

- Doctor reports the launched preview.
- A fresh page is Visual Cockpit at `v0`.

- **Read the cockpit strip.** Run `node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/webmcp-cockpit.txt` and `node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/webmcp-cockpit.png`. The text contains `WebMCP bridge`, `Local bridge` or `Native WebMCP`, and `list_cards`.
- **Open Code Mode.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Code Mode"`.
- **Read the code-mode strip.** Run `node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/webmcp-code-mode.txt` and `node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/webmcp-code-mode.png`. The text still contains `WebMCP bridge` and `append_ensembly_record`.

## Gotchas

- Chrome without `modelContext` shows `Local bridge` and `In-app inspector`. That is the expected fallback, not a failed registration.
- `Allow local writes` is `aria-label` on the toggle. Leaving it off keeps external writes read only.
- Launch wipes the Chrome profile, so the strip starts from the sample workspace at `v0`. A stored older log-card sentence appears only when `visualizer.workspace.v1` is already set.
- Opening Code Mode bumps `stateVersion`. The strip's tool list does not.
