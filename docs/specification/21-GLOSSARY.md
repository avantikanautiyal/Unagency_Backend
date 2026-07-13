# UNAGENCY Intelligence Operating System — Glossary

**Specification Version:** 1.0  
**Status:** Approved

---

## A

### Agent
An autonomous or semi-autonomous actor that pursues goals by invoking intelligence capabilities through the gateway. Future: Agent Platform (M6).

### Agent Platform
Future platform layer (M6) for single-agent, multi-agent, and supervisor-based intelligence operations.

### ACP (Architecture Change Proposal)
Formal proposal required before modifying frozen architecture modules or introducing new cross-module dependencies.

### Analyzer
A learning platform component that extracts `LearningSignal` observations from artifact snapshots. Twelve analyzers are defined in v1.0.

### Artifact
An immutable, versioned, self-describing intelligence object. The canonical interchange format for all intelligence outputs. See [06-ARTIFACT_MODEL.md](./06-ARTIFACT_MODEL.md).

### Artifact Collection
An in-memory grouping of artifact snapshots supporting search, filter, group, and iterate operations.

### Artifact Identity
The unique identification record for an artifact, including type, organization, workspace, and optional scope dimensions.

### Artifact Manifest
A content-addressed summary of an artifact enabling verification without loading the full payload.

### Artifact Registry
Registry of artifact type descriptors. Supports plugin registration of new types (M8).

### Artifact Snapshot
An immutable point-in-time capture of an artifact with manifest and checksum. The standard consumption unit for downstream modules.

### Audit Event
A security-relevant recorded event with branded `AuditEventId`, used for compliance and traceability.

---

## B

### Branded Identifier
A type-safe identifier (e.g., `OrganizationId`, `ExecutionId`) that prevents accidental mixing of plain strings across domain boundaries.

### Business Module
A UNAGENCY product domain module (campaigns, content, analytics). May depend only on `IIntelligenceGateway`.

---

## C

### Calibration
The process of adjusting evaluation sensitivity based on approved samples. Interface-only in v1.0.

### Capability
A defined intelligence operation the platform can execute. Registered in the Capability Registry with version, constraints, and defaults.

### Capability Catalog
Read-only discovery layer over the Capability Registry. Supports query, filter, and sort.

### Capability Registry
Source of truth for capability definitions. The authoritative store for what the platform can do.

### Capability Request
Business-level request to execute a capability. Entry point to the intelligence pipeline.

### Compiled Prompt
Provider-independent prompt output of the Prompt Compiler. Contains AST, messages, variables, and constraints.

### Composition Root
The only location (kernel and gateway bootstrap) where concrete implementations are instantiated and wired to interfaces.

### Confidence Report
Evaluation output separating trust assessment from quality score. Contains confidence level and contributing factors.

### Context
The structured operational environment for intelligence execution. Assembled by the Context Intelligence Engine.

### Control Plane
Modules that govern intelligence (planning, routing, evaluation, learning) without performing provider inference.

### Contract
An immutable data type defining the structure of a domain object. Modules communicate through contracts and interfaces.

---

## D

### Data Plane
The execution layer that performs provider inference. Future: Provider Platform Runtime (M4).

### Dependency Inversion
Architectural principle requiring high-level modules to depend on interfaces, not concrete implementations.

---

## E

### Evaluation
Objective quality assessment of execution outputs via judge pipeline, scoring, confidence, and review disposition.

### Evaluation Report
Structured output of the evaluation judge pipeline with per-judge results and overall summary.

### Execution
The runtime lifecycle of an approved execution plan, managed by the Orchestrator and Execution Runtime.

### Execution Plan
The output of Execution Planning. Defines execution graph, stages, provider selection, and strategies.

### Execution Planning
Module that transforms `CapabilityRequest` into `ExecutionPlan`. Sole owner of provider selection.

### Execution Result
Terminal output of an execution session: state, success flag, output payload, and metadata.

### Execution Runtime
Module managing execution sessions, state machine, monitoring, and lifecycle events.

---

## G

### Gateway
`IIntelligenceGateway` — the sole public entry point for business modules to access intelligence capabilities.

---

## H

### Human Review
Human assessment of intelligence outputs. v1.0 emits disposition signals; M7 operationalizes review queues and approvals.

### Human Platform
Future platform layer (M7) for review queues, expert routing, approvals, escalation, and SLA management.

---

## I

### Intelligence Context
Provider-independent aggregate context produced by the Context Intelligence Engine.

### Intelligence OS
The UNAGENCY Intelligence Operating System — the complete platform documented in this specification.

### Intelligence Pipeline
The canonical lifecycle from capability request through learning signal generation. See [04-INTELLIGENCE_PIPELINE.md](./04-INTELLIGENCE_PIPELINE.md).

---

## J

### Judge
An evaluation pipeline component that assesses execution output against specific criteria. Nine judge types in v1.0.

### Judge Pipeline
Sequential execution of evaluation judges against an execution result, producing `JudgeResult` entries.

---

## K

### Kernel
The platform operating system core: lifecycle management, dependency injection, module registry, health, and composition.

### Knowledge
Curated, retrievable information that informs intelligence execution. Distinct from memory.

### Knowledge Snapshot
Immutable package of ranked, filtered knowledge items produced by the Knowledge Intelligence Engine.

---

## L

### Learning Platform
Module that transforms historical artifact snapshots into signals, patterns, statistics, and recommendations.

### Learning Signal
Atomic observation extracted from an artifact by a learning analyzer.

### Learning Recommendation
Advisory output recommending investigation or improvement. Never modifies platform behavior directly.

### Lineage
Artifact graph position: parents, children, derived-from, created-from references, and scope dimensions.

### Lifecycle (Artifact)
State machine for artifacts: created → validated → published → superseded → archived → deleted.

---

## M

### Memory
Experience layer recording intelligence operation artifacts. Distinct from knowledge.

### Memory Snapshot
Immutable package of classified memory records captured at a point in time.

### Module Boundary
The bounded context of a platform module, enforced by dependency rules and interface contracts.

---

## O

### Orchestrator
Module coordinating approved execution plan lifecycle: validate, dispatch, aggregate, handle failures.

---

## P

### Pattern (Learning)
A detected recurring signal group with frequency and confidence, produced by the pattern detector.

### Plugin Platform
Future platform layer (M8) for SDK, marketplace, and extension registration.

### Prompt Compiler
Module transforming context and knowledge into provider-independent compiled prompts.

### Provenance
Record of what created an artifact and through which intelligence path, including source kinds and timestamps.

### Provider
External AI service (language model, image model, embedding service). Treated as execution engine, not platform owner.

### Provider Capability Matrix
Mapping of provider features and modalities to capability requirements. Used by execution planning.

### Provider Platform
v1.0: metadata, registry, matrix. M4: runtime execution, adapters, streaming, authentication.

---

## R

### Recommendation
See Learning Recommendation.

### Result Pattern
`Result<T>` — structured success/failure return type used throughout the platform instead of thrown exceptions for expected failures.

### Review Decision
Evaluation output indicating human review disposition: mandatory, recommended, optional, or skip.

### Rubric
Evaluation criteria set with weights, thresholds, and passing score used by the judge pipeline.

---

## S

### Scheduler
Contract module for deferred and scheduled execution. Full implementation deferred to Workflow Platform (M5).

### Scope
Operational boundary (organization, workspace, project, session, etc.) applied to context, memory, and learning.

### Signature (Artifact)
Content checksum and optional cryptographic signature ensuring artifact integrity.

### Snapshot
Immutable point-in-time capture of a domain object (context, knowledge, memory, artifact).

---

## T

### Template (Prompt)
Reusable prompt structure with variables, constraints, and sections, resolved by the Prompt Compiler.

### Tenant Isolation
Security boundary enforced by `organizationId` and `workspaceId` across all intelligence operations.

### Trust Gate
Security contract port for trust-level verification before intelligence operations proceed.

---

## V

### Versioning
Multi-layer version tracking: platform, module, contract, artifact, and provider compatibility. See [19-VERSIONING.md](./19-VERSIONING.md).

---

## W

### Workflow
Multi-step intelligence operation with conditions, loops, human nodes, and events. Future: Workflow Platform (M5).

### Workflow Platform
Future platform layer (M5) for workflow runtime and execution graph management.

---

## Document Index

| Term | Primary Document |
|------|------------------|
| Artifact | [06-ARTIFACT_MODEL.md](./06-ARTIFACT_MODEL.md) |
| Context | [07-CONTEXT_MODEL.md](./07-CONTEXT_MODEL.md) |
| Knowledge | [08-KNOWLEDGE_MODEL.md](./08-KNOWLEDGE_MODEL.md) |
| Prompt | [09-PROMPT_COMPILER.md](./09-PROMPT_COMPILER.md) |
| Memory | [10-MEMORY_MODEL.md](./10-MEMORY_MODEL.md) |
| Evaluation | [11-EVALUATION_MODEL.md](./11-EVALUATION_MODEL.md) |
| Learning | [12-LEARNING_MODEL.md](./12-LEARNING_MODEL.md) |
| Provider | [13-PROVIDER_PLATFORM.md](./13-PROVIDER_PLATFORM.md) |
| Workflow | [14-WORKFLOW_PLATFORM.md](./14-WORKFLOW_PLATFORM.md) |
| Agent | [15-AGENT_PLATFORM.md](./15-AGENT_PLATFORM.md) |
| Human | [16-HUMAN_PLATFORM.md](./16-HUMAN_PLATFORM.md) |
| Plugin | [17-PLUGIN_PLATFORM.md](./17-PLUGIN_PLATFORM.md) |
| Security | [18-SECURITY_MODEL.md](./18-SECURITY_MODEL.md) |
| Pipeline | [04-INTELLIGENCE_PIPELINE.md](./04-INTELLIGENCE_PIPELINE.md) |
| Dependencies | [03-DEPENDENCY_RULES.md](./03-DEPENDENCY_RULES.md) |
| Roadmap | [20-ROADMAP.md](./20-ROADMAP.md) |
