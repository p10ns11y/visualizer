# Headless MCP

`@visualizer/mcp` serves the same workspace tools as the in-browser WebMCP bridge over Streamable HTTP. The process binds to `127.0.0.1` and stores the workspace in a JSON file. Writes stay off until `VISUALIZER_MCP_ALLOW_WRITES=1` or a bearer matches `VISUALIZER_MCP_WRITE_TOKEN`. This file is a terminal walkthrough. The browser harness does not start the server.

## Sub-features

- `mcp-listen` prints a `http://127.0.0.1:<port>/mcp` URL and refuses any host other than `127.0.0.1`.
- `mcp-read` lists problem cards with writes off.
- `mcp-write` appends a ledger record only after the flag or the bearer token is set, and a second client process reads that record from the same file.

## How to get to it (user POV)

- From the repo root, pick an empty state path and start the server with writes off.
- Point a Streamable HTTP client at the printed URL and call `list_cards`.
- Restart with `VISUALIZER_MCP_ALLOW_WRITES=1` on the same state path, append a record, and read `read_ensembly_ledger` from a second process.

## Driving it with verify-visualizer

Preconditions:

- Node can run `node --import tsx` inside `apps/mcp`.
- Nothing else needs the chosen port. Port `0` asks the OS for a free port.

- **Start closed.** Run `VISUALIZER_MCP_PORT=0 VISUALIZER_MCP_STATE=/tmp/visualizer-walkthrough.json VISUALIZER_MCP_STATE_ROOT=/tmp VISUALIZER_MCP_ALLOW_WRITES=0 pnpm --filter @visualizer/mcp start`. The first line contains `http://127.0.0.1:` and `writes=off`. The state path has to stay inside `VISUALIZER_MCP_STATE_ROOT`.
- **Read.** Run `node --import tsx src/client-once.ts <url> list_cards '{}'` from `apps/mcp`. The JSON text contains `"ok":true` and `Ensembly shared log`.
- **Write denied.** Call `append_ensembly_record` with the current `stateVersion`. The text contains `READ_ONLY`.
- **Write allowed.** Restart with `VISUALIZER_MCP_ALLOW_WRITES=1` and the same state path. Append one synthetic record, then run `read_ensembly_ledger` in a second terminal. The record id is in that output.

## Gotchas

- Stdout is fully buffered when the process is not a terminal. `src/main.ts` uses a synchronous write so a piped client can see the URL.
- A configured write token ignores the allow flag. The bearer has to match. The token is not printed.
- The browser preview keeps using `localStorage`. The HTTP server does not read that store.
