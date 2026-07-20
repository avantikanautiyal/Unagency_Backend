# Experience Repository Model

## IExperienceRepository

```typescript
interface IExperienceRepository {
  save(experience): Result<Experience>;
  saveMany(experiences): Result<readonly Experience[]>;
  findById(id): Result<Experience | undefined>;
  findAll(): Result<readonly Experience[]>;
  search(query): Result<ExperienceSearchResult>;
  snapshot(): Result<ExperienceSnapshot>;
  count(): Result<number>;
}
```

## Implementation

`InMemoryExperienceRepository` — no database.

Stores: experiences, snapshots, versions, relationships, corrections, applicability, statistics.

## Location

`experience-repository/in-memory-experience-repository.ts`
