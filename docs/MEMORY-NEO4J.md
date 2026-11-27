# Memory graph

Visualizer keeps two layers on the shared workspace.

| Layer | What it stores | When it changes |
| :--- | :--- | :--- |
| Ensembly ledger | Append-only records: `rule`, `costly_mistake`, or `decision`, each with a summary, rationale, provenance, and an optional confirmed outcome. | A person appends a record. A second append of the same id does not rewrite the first. |
| Pulse Memory | The same record after a confirmed outcome. | Promotion copies the record. An empty outcome stays on the ledger. |
| Workflow lessons | A friction, rework, or adjustment note linked to a railway phase and, when present, a problem card. | A person records a lesson. A working phase pauses, the same way a statement edit does. |

`ensembly` stays the verified ledger. Visualizer writes an append-only JSONL line per record and an `ensembly-pulse-pack-v1` pack. The pack hash follows `compute_pack_hash` in `thecuriousts/ensembly` `crates/ensembly-kernel/src/pulse_pack.rs`: serde struct field order for traces and archive events, sorted keys for JSON values, and SHA-256 of `{"archive":…,"memory_hash":…,"traces":…}`. Only records with a confirmed outcome become `memory_traces`. Archive events carry every ledger line. Import is idempotent: the same id and body is skipped, and a different body for that id is reported and does not replace the first line.

## Neo4j projection

`MemoryGraphStore` is the port. `Neo4jMemoryStore` (`@visualizer/core/neo4j`) runs the official `neo4j-driver` and the statements in `packages/core/src/memory/cypher/schema.cypher`. Query text is fixed. Record fields travel as parameters. `ON CREATE SET` keeps the first write.

`InMemoryGraphMemoryStore` implements the same port. Unit tests, critical flows, model-based paths, and the formal check use it. They do not open a Bolt socket.

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
