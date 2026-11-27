# 005 Dynamic catalog under the XState owner

- **Date:** 2026-11-27
- **Status:** Accepted

## Decision

Keep XState 6 as the only state owner. Add one Zod catalog for a sample SI fleet map. Render that spec as text and SVG. Let an SI agent read `snapshot` and file a refactor with `act` by action id. The proposal stays pending until a person approves or rejects it. Neither step rewrites the graph.

`@ui-sdk/react` `0.1.0-beta.17` stays the control primitive. `createAgent().snapshot()` contributes control refs. `createAgent().act()` is wired and refused, so an agent does not press cockpit buttons. Fleet writes go through the bridge tool `act`, which the headless `@visualizer/mcp` server already exposes because it registers the bridge list. Writes stay off by default.

## Why

A bot fleet starts as one task and grows into overlapping routines, shared stores, cycles, and dead edges. The cockpit needs a picture of those links and a way for an SI agent to propose a retune without becoming the state owner. [json-render](https://json-render.dev/) `@json-render/core` `0.23.2` and [A2UI 1.0](https://a2ui.org/specification/v1.0-a2ui/) via `@a2ui/react` `0.16.1` both bring a generative UI runtime. This repo needs one checked surface. A Zod catalog plus `parse` from `@adaptate/core` stays inside the existing contract tools.

The sample names are generic. There is no personal data and no real host name. The motivation is [Uncle Bob, 27 Nov 2026](https://x.com/unclebobmartin/status/2123401950305660969).

## What stays closed

The catalog does not accept unknown components, extra props, or executable markup. Text is checked after control characters, whitespace, and numeric or colon entities are folded, and a key matching `on` plus a capital letter is refused. The renderer does not use `dangerouslySetInnerHTML`. When the spec does not validate, the page shows the rejection and stays mounted. The catalog lists pending proposals only, and only as many as fit under the 80-element cap.

`act` does not apply a merge, delete an edge, or change `stateVersion`. It returns the pending row it just filed. A second pending row for the same action is refused. Approving or rejecting a proposal appends a memory log entry and increments `logSeq`. That decision does not change `stateVersion` or the graph. An unknown id, or an id that is already approved or rejected, is an error. `mergeAuxIntoTick` takes the live proposal ledger, because a build tick does not edit those rows, so an approval during the tick stays approved.
