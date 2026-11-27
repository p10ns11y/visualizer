# Visualizer

A visual pilot cockpit for self-hosted SI — speak, sketch, and let the run drive itself.

![One App, Two Modes, One Shared State](docs/diagrams/architecture-cockpit.svg)

## Problem

Text-box-only SI workflows force a builder to describe, wait, and re-describe — hiding the plan in a chat log and locking the work to a cloud session. Visualizer turns spoken thinking, rough sketches, and live mockups into a self-hosted cockpit you can start, watch, and steer. When tokens run out or access drops, the same local control graph keeps running on deterministic code and lightweight open-source decision models. SGI stays a horizon; this scaffold is self-hosted SI you can pause.

## Locked Decisions

| Decision | Lock |
| :--- | :--- |
| **Code Mode toggle** | One shared typed state, on a `@ui-sdk/react` one-app, two-modes base. |
| **Reuse, don't rebuild** | Opportunity Finder's dual-mode collision guards (`stateVersion` + Stop banner), XState railway, and `adaptate` + Zod typed contracts. |
| **3-tier fallback** | Deterministic code and lightweight open-source decision models when tokens run out or access is lost. |
| **Local tool handoff** | Coding tasks go to available local CLI and GUI tools (Cursor, Claude Code, and other local harnesses) plus essential MCP connectors. |

![Pilot / Rail-Driver Autopilot Loop](docs/diagrams/pilot-flow.svg)

![3-Tier Brain Degradation and Reuse Map](docs/diagrams/fallback-tiers.svg)

## Comparison: Visualizer vs. Chopin and Ecosystem References

| Dimension | Visualizer | [Chopin](https://githubnext.com/projects/chopin/) (GitHub Next) |
| :--- | :--- | :--- |
| **Input** | Voice- and canvas-first | Document- and chat-first (MDX, chat, and comments) |
| **Primary user** | Solo builder, from idea to shipped app | Software teams aligning on a feature before coding |
| **Core primitives** | Problem-statement cards, live mockups, freehand sketches, pluggable design systems, database arrows, Build trigger | Living MDX plan, decision cards, research blocks, side-by-side UI prototypes, jigs |
| **Output** | Direct build trigger from the cockpit | Living, versioned specification, handed to a coding agent via MCP |
| **Collaboration** | Human-in-the-loop solo flow | Real-time multiplayer (teammates + agents) |
| **Anchored to** | Workflow, skills, and local tools | An existing GitHub repository |
| **Maturity** | Early scaffold | Early open-source prototype |
| **Bridge** | Can import or export via MCP later, if desired | Exposes an MCP server |

**Ecosystem references** — useful around the cockpit, not a substitute for it:

- **[Lopsi](https://github.com/frankievalentine/lopsi-bot-eve)** — third-party Apache-2.0 template on [Vercel Eve](https://github.com/vercel/eve). Its folder-per-agent layout is inspiration only; this repo does not fork Lopsi, and the cockpit is not built around Eve.
- **[Vercel Board](https://github.com/vercel/board)** — a headless message and task board. Optional later as a local SQLite work log (`npx @vercel/board serve`, including `--tailscale`). It is not a visual canvas.

## Run

```sh
pnpm install
pnpm dev
pnpm typecheck && pnpm test && pnpm test:critical-flows && pnpm verify:formal && pnpm build
```

`@visualizer/core` holds the shared workspace, collision guards, XState railway, 3-tier brain, and local tool contracts. `@visualizer/web` is the one app: Visual Cockpit and Code Mode read and write that same state. Button and toggle behavior comes from `@ui-sdk/react`, wrapped in `apps/web/src/ui/controls.tsx`.

Step 1 opens with problem cards for Step 2 of Visualizer itself: freehand canvas sketching, a live WebMCP `document.modelContext` bridge, and a local `@vercel/board` SQLite log. Build runs the Tier 1 railway. Stop pauses it. A verified Step 2 brief then shows in both modes.

### Local decision model

Tier 2 calls an OpenAI-compatible server. `VISUALIZER_LOCAL_MODEL_URL` defaults to `http://127.0.0.1:11434/v1`. `VISUALIZER_LOCAL_MODEL_NAME` defaults to `decision`. On the machine aliased `laptop-1`, point those variables at the local server and run:

```sh
pnpm test:local-model
```

`VISUALIZER_LOCAL_MODEL_STRICT=1` exits non-zero unless Tier 2 answers. The critical-flow smoke runs the same command and accepts a Tier 1 fallback, so a missing local server does not fail CI. The cockpit Build stays on Tier 1.

Critical flows are listed in `docs/CRITICAL-FLOWS.md`. `pnpm verify:formal` checks `stateVersion` and the pilot railway. Browser steps for the cockpit live in `.cursor/skills/verify-visualizer/`.

## References

- [`adaptate`](https://github.com/p10ns11y/adaptate) (`@adaptate/core`, `@adaptate/utils`) — typed contracts reused with Zod. The autopilot stream uses `transformSchema`, `makeConditionalSchemaTransformer`, `parse` / `parseStream` from `@adaptate/core/result`, and `fromAsyncIterableSteps` from `@adaptate/core/stream-incremental`. Connector schemas use `zodToOpenAPISchema`.
- `@ui-sdk/react` — one-app, two-modes primitives and shared-state interaction
- [XState](https://xstate.js.org) 6 — statecharts and the railway backbone
- [Chopin](https://githubnext.com/projects/chopin/) — GitHub Next's multiplayer MDX planning prototype
- [Lopsi](https://github.com/frankievalentine/lopsi-bot-eve) — folder-per-agent layout inspiration
- [Vercel Board](https://github.com/vercel/board) — optional local task and event log
