# Conflict Resolution Model

## Problem

Multiple experiences may recommend opposing actions (e.g. playful vs formal tone).

## Strategies

| Strategy | Winner Selection |
|----------|------------------|
| highest_confidence | Highest confidence |
| highest_evidence | Highest evidenceScore |
| most_applicable | Highest applicabilityScore |
| most_recent | Latest createdAt |
| prefer_trusted_lifecycle | preferred > trusted > validated > draft |

## Output

`ConflictResolutionResult` with conflicts, resolved experiences, discarded IDs.

Only one recommendation remains per conflict dimension.

## Location

`conflict-resolution/conflict-resolver.ts`, `contracts/conflict.ts`
