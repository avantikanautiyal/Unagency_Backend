# Architecture Review — Capability Intelligence

## Verdict

**Approved.** Capability Intelligence is the capability-first control surface that
turns business objectives into executable capability plans without selecting
providers or models.

## Owns vs does not own

| Owns | Does not own |
|------|----------------|
| Capability taxonomy & registry | Provider execution |
| Discovery / composition / DAG | Model binding |
| Dependency resolution | Routing / negotiation binding |
| Scorecards & recommendations | Frozen module mutation |
| Execution capability plans | Networking / SDKs |

## Pipeline integrity

Business objective (+ optional frozen plans/snapshots) → discovery → seed
selection → transitive dependency expansion → composition (graph/bundle) →
scores → recommendations → compatibility → `CapabilityExecutionPlan`.

## Architectural principle

Business modules request capabilities (`marketing.copywriting`), never brands
(`GPT`, `Claude`, `OpenAI`). Supported providers/models on definitions are
advisory implementation hints only.

## Risks

| Risk | Mitigation |
|------|------------|
| Overlapping with capability-registry | This module is planning intelligence; registry remains source-of-truth storage. Taxonomy seed is local and evolveable. |
| Empty discovery | Prefer `preferredCapabilityIds`; ValidationError if none match |
| Accidental provider coupling | No dispatcher/runtime deps; consumer interfaces only |

## Dependency posture

Read-only imports of frozen plan/snapshot **types**. No edits to frozen modules.
