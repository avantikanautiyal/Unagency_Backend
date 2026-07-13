# Future Extension Report — M2.2 Knowledge Intelligence Engine

## Designed for later (not implemented)

### Knowledge sources (`IKnowledgeSource`)

| Future adapter | Purpose |
|----------------|---------|
| MongoKnowledgeSource | Document store retrieval |
| S3KnowledgeSource | Object-storage documents |
| PDFKnowledgeSource | Parsed PDF corpora |
| BrandGuidelineKnowledgeSource | Brand packs |
| GoogleDriveKnowledgeSource | Drive files |
| SharePointKnowledgeSource | SharePoint libraries |
| ConfluenceKnowledgeSource | Wiki pages |
| VectorKnowledgeSource | Vector-backed retrieval (still behind interface) |
| WebsiteKnowledgeSource | Crawled pages |
| APISource | External knowledge APIs |

### Indexes (`IKnowledgeIndex` family)

- Vector Index (Qdrant, Pinecone, Weaviate, pgvector, etc.)
- Keyword Index (OpenSearch, Elasticsearch, Lucene)
- Metadata Index
- Hybrid Index

### Caching

- Redis / distributed cache adapters behind `IKnowledgeCache`
- Current: in-memory only

### Ranking

- Real semantic/embedding-based ranking
- Learned hybrid ranking
- Current: placeholder scoring only

## Explicitly not implemented in M2.2

- Any vector database client
- Any embedding model or provider SDK
- MongoDB / Redis / BullMQ connections
- HTTP retrieval
- Prompt Compiler integration wiring (consumes snapshots later)

The module is ready to accept adapters without changing the public engine pipeline.
