# Search Model

## ExperienceSearchQuery

Supports filtering by: capability, department, workflow, provider, model, task,
language, organization, workspace, prompt template, correction type, category,
similar experience reference.

## ExperienceSearchResult

```typescript
interface ExperienceSearchResult {
  readonly queryId: string;
  readonly experiences: readonly Experience[];
  readonly totalMatches: number;
  readonly searchedAt: string;
}
```

## API

```typescript
const results = await engine.search({
  queryId: "q1",
  capabilityId: "text.generate",
  category: "best_practice",
  limit: 20,
});
```

## Location

`contracts/search.ts`, `search/experience-search-engine.ts`
