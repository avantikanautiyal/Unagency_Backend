# Experience Injection — Future Extension Report

## FE-INJ1 — Wire Execution Intelligence

Implement `IExecutionIntelligenceInjectionConsumer`. Execution Intelligence calls
`inject()` and applies advisory package — never searches repository directly.

## FE-INJ2 — Prompt Compiler Consumer

`IPromptCompilerInjectionConsumer` — consume package constraints without splicing
raw prompt text from experiences.

## FE-INJ3 — True Semantic Similarity

Replace `PlaceholderSemanticSimilarityEngine` with embedding-based matcher.
Keep interface stable; never call vendor SDKs from this module directly.

## FE-INJ4 — Persistent Index

Add inverted indexes over capability / department / workflow for million-scale repos.

## FE-INJ5 — A/B Injection Policies

Experiment with conflict strategies and Top N policies with telemetry.

## Non-Goals (This Milestone)

- Integration into frozen modules
- Provider execution
- Prompt compilation or mutation
- Creating new experiences (Experience Intelligence owns that)
