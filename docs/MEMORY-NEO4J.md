# Memory graph

Two layers live on the shared workspace. Neo4j is an optional projection of those same fields. Unit tests, critical flows, model-based paths, and the formal check use `InMemoryGraphMemoryStore`. They do not open a Bolt socket.

| Layer | What it stores | When it changes |
| :--- | :--- | :--- |
| Ensembly ledger | Append-only records: `rule`, `costly_mistake`, or `decision`, each with a summary, rationale, provenance, and an optional confirmed outcome. | A person appends a record. A second append of the same id does not rewrite the first. |
| Pulse Memory | A ledger row `canPromote` admits: a confirmed outcome, `status: user-stated`, or `status: tool-verified` whose `verifyHash` is `sha256:` plus the SHA-256 of the summary. `supersededBy` keeps that row out of the active inject. | Promotion copies the record. `buildPulseInject` keeps at most 8 active traces inside a 120-token budget. The count is `ceil(utf-8 bytes / 4)` of `{ schema, traces }`. |
| Workflow lessons | A friction, rework, or adjustment note linked to a railway phase and, when present, a problem card. | A person records a lesson. A working phase keeps running, and `stateVersion` does not change. |

Visualizer writes Canon 1 `pulse-pack-v1`. Packs labeled `ensembly-pulse-pack-v1` or `peram-pulse-pack-v1` are read only, as are packs that omit `ext`. The pack hash follows `compute_pack_hash` in `thecuriousts/ensembly` `crates/ensembly-kernel/src/pulse_pack.rs`: serde struct field order for traces and archive events, sorted keys for JSON values, and SHA-256 of `{"archive":…,"memory_hash":…,"traces":…}`. Only records `canPromote` admits become `memory_traces`. Archive events carry every ledger line. Import is idempotent: the same id and body is skipped, and a different body for that id is reported and does not replace the first line.

The layer contract is in [`ARCHITECTURE-LAYERS.md`](ARCHITECTURE-LAYERS.md). The alignment note is [`decisions/003-ensembly-pulse-alignment-audit.md`](decisions/003-ensembly-pulse-alignment-audit.md).

## Neo4j projection

`MemoryGraphStore` is the port. `Neo4jMemoryStore` (`@visualizer/core/neo4j`) runs the official `neo4j-driver` `6.3.2` and the statements in `packages/core/src/memory/cypher/schema.cypher`. Query text is fixed. Record fields travel as parameters. `ON CREATE SET` keeps the first write.

Local Neo4j, optional:

```sh
export NEO4J_PASSWORD='choose-a-local-password'
docker compose -f docker-compose.neo4j.yml up -d
export NEO4J_URI='bolt://127.0.0.1:7687'
export NEO4J_USERNAME='neo4j'
export NEO4J_PASSWORD
```

`Neo4jMemoryStore.fromEnv` returns null unless `NEO4J_URI` and `NEO4J_PASSWORD` are both set. Apply `schema.cypher` with `ensureSchema`, or paste it into the browser at `http://127.0.0.1:7474`.

`cypher/vector-index.cypher` is not applied. It records the Neo4j 2026.01 vector index shape (`WITH` lists filterable properties for a later `SEARCH`) for when embeddings exist. Until then, kind and phase filters are ordinary `WHERE` clauses.

## Optional ecosystem hooks

These are not runtime dependencies.

- **Neo4j MCP / `neo4j-agent-memory`:** the self-hosted `graph_query` tool accepts read-only Cypher. Writes stay in `Neo4jMemoryStore`. A read-only client can list `:VisualizerPulseMemory` and the `:DURING` / `:ABOUT` edges.
- **Neo4j GraphRAG:** `HybridCypherRetriever` can sit on the optional vector index and then traverse `PROMOTED_FROM`, `DURING`, and `ABOUT`. The Python package is not imported here.

The house pulse-memory store remains SQLite. This graph is the Visualizer projection for lesson, phase, and card walks.
