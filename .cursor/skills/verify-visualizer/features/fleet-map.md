# Fleet interconnection map

The cockpit shows a sample map of bots, routines, tasks, and shared stores. Findings list a cycle, fan-in and fan-out hotspots, orphan nodes, and a dead edge. The snapshot token comparison sits beside that list.

## Sub-features

- `fleet-map` draws the sample nodes and edges, including the dashed dead edge.
- `fleet-findings` names the cycle, the hotspots, the orphan nodes, and the dead edge.
- `fleet-tokens` shows three counts: Snapshot, Accessibility tree, and DOM. Snapshot is the smaller count.
- `fleet-ledger` reads `No pending proposals` until an approved `act` files one. Approve and Reject change that row's status and leave a log line. Decided rows stay in the workspace ledger and drop off this list. The graph stays.

## How to get to it (user POV)

- Open the preview. The section heading is `SI fleet interconnections`, under the WebMCP strip, in Visual Cockpit.
- Read `Intake bot`, `Cycle across`, and the three token counts.
- Press `Code Mode`. The same map stays on the page.

## Driving it with verify-visualizer

Preconditions:

- A fresh launch, Visual Cockpit, phase `idle`.
- The map is sample data. Do not type a host name or a personal name into it.

```sh
node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/fleet-map.txt
node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/fleet-map.png
```

The text dump must include `Intake bot` and `Snapshot`. This file is the map for a later drive. Do not mark it verified because another feature passed.

## Gotchas

- `act` is a tool, not a button on the map. With local writes off, it files nothing.
- Approve and Reject appear only after a proposal exists. They do not move nodes. A long decided ledger still shows the map. The list on screen is the pending rows that fit the catalog.
- The token counts are `ceil(utf-8 bytes / 4)` for the compact snapshot, the role-and-name listing, and the HTML serialization of this surface. On the sample fleet they are 704, 853, and 1144.
