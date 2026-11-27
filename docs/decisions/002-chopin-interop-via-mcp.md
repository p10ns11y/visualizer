# 002 Chopin interop via an MCP adapter

- **Date:** 2026-11-27
- **Status:** Proposed

## Decision

Keep GitHub Next's [Chopin](https://githubnext.com/projects/chopin/) (`githubnext/chopin`, a Bun and Postgres self-hosted multiplayer MDX planning prototype) behind a thin adapter port. `visualizer` can interoperate without coupling its core to that experimental upstream.

## Why they complement each other

Chopin stops at multiplayer planning. Its default Planner (`copilot-sdk`) has bounded, repository-fixed read tools on GitHub and no checkout, shell, or host filesystem, so it does not execute code. `HARNESS=atomic` is a separate server-local mode and is not an interop path. `visualizer` owns execution, the XState 6 railway, `stateVersion` human pause, freehand visual thinking, and Ensembly plus Neo4j memory.

## Three integration paths

Read from `githubnext/chopin` `docs/architecture.md` on `main` (2026-11-27). None of these paths is built here.

1. **Streamable HTTP MCP bridge (first slice).** Chopin serves a bearer-authenticated MCP endpoint at `/mcp` from the same origin as its HTTP API. Pull access is read only. Push or administration access permits document updates. The adapter pulls approved MDX plans and attributed Decisions into `visualizer` cards, and pushes verified execution progress and statechart diagrams back into Chopin.
2. **Remote Planner harness (`HARNESS=remote` via `/api/v1/agent` WebSocket).** The upgrade offers `chopin.agent.v1` and carries a GitHub bearer. The attached client runs the model. Chopin's host tools, Decisions, and room writes stay on the server, one client per document. The adapter runs `visualizer`'s Coordinator, backed by Ensembly Pulse Memory and Neo4j Workflow Memory, as Chopin's live Planner inside a multiplayer document.
3. **Decision-ledger alignment.** Question answers and accepted comment threads are durable records outside the prose. MDX nodes are projections, and the records stay authoritative. The adapter maps those attributed human Decisions into Ensembly's append-only ledger. Verified outcomes promote into Neo4j Pulse Memory.

## Caveat

Chopin has no public hosted instance, and its prototype APIs may shift. The adapter port is the only Chopin speaker, so that shift stays out of `visualizer`'s core.
