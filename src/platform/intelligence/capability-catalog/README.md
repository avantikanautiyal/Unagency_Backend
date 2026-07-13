# Capability Catalog

## Purpose

Discovery and browsing layer for capabilities.

**Never owns capabilities.** The Capability Registry is the source of truth.

## Responsibilities

- find by id / category / tag / name
- list, search, filter, browse, sort
- categories, tags
- popular, recent, featured (simple heuristics)

## Architecture

```
Capability Registry  (owns data)
        ↓ read-only
Capability Catalog   (exposes discovery)
        ↓
Future Planner
```

## Usage

```typescript
import { CapabilityRegistry } from "../capability-registry";
import { CapabilityCatalog } from "../capability-catalog";

const registry = new CapabilityRegistry();
const catalog = new CapabilityCatalog(registry);

const results = await catalog.search("brief");
const categories = await catalog.categories();
```

## Sequence — search

```
Caller → Catalog.search(query)
       → Registry.list()
       → filter in-memory
       → Result<CapabilityDefinition[]>
```

## Boundaries / MUST NOT

- Own or mutate capability storage
- Register capabilities (use registry)
- Execute AI or select providers
- Depend on planner, gateway, or business modules
- Persist to MongoDB/Redis
