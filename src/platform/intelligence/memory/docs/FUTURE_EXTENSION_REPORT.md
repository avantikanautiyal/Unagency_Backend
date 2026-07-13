# Future Extension Report — M2.4 Memory Intelligence Engine

## Designed for later (not implemented)

### Stores (`IMemoryStore`)

| Adapter | Purpose |
|---------|---------|
| MongoMemoryStore | Durable document memory |
| RedisMemoryStore | Short-term / working memory |
| VectorMemoryStore | Similarity retrieval (still behind interface) |
| BlobMemoryStore | Large artifact payloads |

### Indexes (`IMemoryIndex`)

- Vector, Keyword, Metadata, Temporal

### Compression

- Real summarize / merge algorithms
- Current: passthrough / simple dedupe / importance sort

### Integration

- Automatic ingest from Gateway / Orchestrator / Runtime
- Learning Engine references (`learning_reference` classification)

## Explicitly not implemented

- Provider SDKs
- Learning Engine
- Evaluation Engine
- MongoDB / Redis / vector DBs
- Embeddings
- HTTP APIs
