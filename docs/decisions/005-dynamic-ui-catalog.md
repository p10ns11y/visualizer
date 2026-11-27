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

The catalog does not accept unknown components, extra props, or executable markup. The renderer does not use `dangerouslySetInnerHTML`. `act` does not apply a merge, delete an edge, or change `stateVersion`. A person marks the proposal approved or rejected, and the graph stays as written.
