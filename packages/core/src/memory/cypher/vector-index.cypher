// Optional. Do not run this with the uniqueness constraints.
// Visualizer does not store embeddings in this slice.
// On Neo4j 2026.01 or newer, WITH lists the properties a later SEARCH filter may use.
// GraphRAG HybridCypherRetriever can target this index once an embedding property exists.
//
// CYPHER 25
// CREATE VECTOR INDEX visualizer_pulse_summary IF NOT EXISTS
// FOR (pulse:VisualizerPulseMemory) ON pulse.embedding
// WITH [pulse.kind, pulse.timestamp]
// OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: 'cosine' } };
