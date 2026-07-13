# Knowledge Intelligence Engine (M2.2)

## Purpose

Discover, retrieve, filter, rank, and package knowledge for the Prompt Compiler.

Provider-independent. Not RAG. Not vector search. Not prompt generation.

## Retrieval pipeline

```
KnowledgeRequest
  → Permission Validation
  → Resolve Sources
  → Retrieve Knowledge
  → Permission Filter
  → Rank Knowledge
  → Filter Knowledge
  → Build Snapshot
  → KnowledgeResult
```

## Source hierarchy

`IKnowledgeSource` implementations (placeholders now):

inline, brand_guideline — present  
mongo, s3, pdf, google_drive, sharepoint, confluence, vector, website, api — future adapters

## Ranking architecture

Placeholder strategies: semantic, keyword, freshness, brand, hybrid.

## Filtering architecture

Deduplicate, exclude deprecated/expired, tag include/exclude, min relevance, max documents/chunks.

## Permission validation flow

Authorize identity/scope/permissions → filter restricted classifications.

## Snapshot model

Immutable `KnowledgeSnapshot` with documents, chunks, sources, references, checksum.

## Usage

```typescript
import {
  createKnowledgeIntelligenceEngine,
  KnowledgeRequestBuilder,
} from "./platform/intelligence/knowledge";
import { createContextIntelligenceEngine } from "./platform/intelligence/context";

const contextEngine = createContextIntelligenceEngine();
const knowledgeEngine = createKnowledgeIntelligenceEngine();

const context = await contextEngine.build({ ... });
const request = KnowledgeRequestBuilder.fromIntelligenceContext(context.value, "brand").build();
const result = await knowledgeEngine.query(request);
```

## Boundaries / MUST NOT

- Generate prompts or execute providers
- Know GPT/Claude/Gemini or embedding models
- Connect to MongoDB/Redis/vector DBs
- Contain business logic
