# 004 Headless MCP for outside SI agents

- **Date:** 2026-11-27
- **Status:** Accepted

## Decision

Serve the workspace tools over Streamable HTTP from `@visualizer/mcp`, on `127.0.0.1`, backed by `@visualizer/core`. Persist the workspace to a JSON file so a second process sees the same records. Keep XState 6 as the only state owner. Leave stdio for a later slice.

Writes stay off unless `VISUALIZER_MCP_ALLOW_WRITES=1` or the bearer matches `VISUALIZER_MCP_WRITE_TOKEN`. When the token is set, the flag alone does not open writes.

## Why

A dogfood run on 27 Nov 2026 could not use the cockpit without a browser tab. The in-browser WebMCP bridge stays for the page. The HTTP server is the headless transport for outside SI agents. The same run showed seven blockers, fixed with this server: no headless transport, missing build and pack tools, box packs that omit `ext`, lessons and ledger rows dropped when a tick lands, ledger writes that paused the railway, a token count that measured snippets instead of the serialized inject, and a local write approval that did not survive reload.

## What stays closed

The server does not bind a public interface. It does not turn writes on by default. It does not replace `document.modelContext` on the page. The page approval key `visualizer.webmcp.approval` is a separate opt-in and is removed when the toggle is turned off.
