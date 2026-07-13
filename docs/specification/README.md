# UNAGENCY Intelligence Operating System — Platform Specification v1.0

**Status:** Approved  
**Milestone:** M3.4  
**Audience:** Engineering, Architecture, Product, Operations

---

## About This Specification

This document set is the official engineering reference for the UNAGENCY Intelligence Operating System v1.0. It describes the approved architecture without requiring inspection of implementation code.

All architecture modules through Milestone M3.3 are **frozen**. Future changes require Architecture Change Proposals (ACPs).

---

## Document Index

| # | Document | Description |
|---|----------|-------------|
| 00 | [Vision](./00-VISION.md) | Why the Intelligence OS exists, enterprise philosophy, long-term vision |
| 01 | [System Overview](./01-SYSTEM_OVERVIEW.md) | Layered architecture, platform layers, high-level diagrams |
| 02 | [Architecture](./02-ARCHITECTURE.md) | Every module: responsibilities, inputs, outputs, dependencies |
| 03 | [Dependency Rules](./03-DEPENDENCY_RULES.md) | Allowed/forbidden dependencies, inversion, boundaries |
| 04 | [Intelligence Pipeline](./04-INTELLIGENCE_PIPELINE.md) | Complete lifecycle from request to learning signal |
| 05 | [Control Plane](./05-CONTROL_PLANE.md) | Planning, routing, policy, evaluation, learning governance |
| 06 | [Artifact Model](./06-ARTIFACT_MODEL.md) | Canonical immutable intelligence objects |
| 07 | [Context Model](./07-CONTEXT_MODEL.md) | Context construction, sections, snapshots |
| 08 | [Knowledge Model](./08-KNOWLEDGE_MODEL.md) | Knowledge retrieval, ranking, filtering, snapshots |
| 09 | [Prompt Compiler](./09-PROMPT_COMPILER.md) | Templates, AST, compilation, provider independence |
| 10 | [Memory Model](./10-MEMORY_MODEL.md) | Experience layer, retention, classification |
| 11 | [Evaluation Model](./11-EVALUATION_MODEL.md) | Judges, confidence, review decisions |
| 12 | [Learning Model](./12-LEARNING_MODEL.md) | Signals, patterns, recommendations |
| 13 | [Provider Platform](./13-PROVIDER_PLATFORM.md) | Future provider runtime (M4) |
| 14 | [Workflow Platform](./14-WORKFLOW_PLATFORM.md) | Future workflow runtime (M5) |
| 15 | [Agent Platform](./15-AGENT_PLATFORM.md) | Future agent runtime (M6) |
| 16 | [Human Platform](./16-HUMAN_PLATFORM.md) | Future human review (M7) |
| 17 | [Plugin Platform](./17-PLUGIN_PLATFORM.md) | Future extensions (M8) |
| 18 | [Security Model](./18-SECURITY_MODEL.md) | Auth, audit, isolation, integrity |
| 19 | [Versioning](./19-VERSIONING.md) | Platform, module, contract, artifact versioning |
| 20 | [Roadmap](./20-ROADMAP.md) | Completed and future milestones |
| 21 | [Glossary](./21-GLOSSARY.md) | Term definitions |

---

## Reading Order

**For new engineers:**
1. Vision → System Overview → Architecture → Dependency Rules
2. Intelligence Pipeline → Control Plane
3. Domain models (Context through Learning)
4. Security → Versioning → Glossary

**For integration work:**
1. Intelligence Pipeline → Gateway (Architecture)
2. Artifact Model
3. Dependency Rules

**For future platform work:**
1. Roadmap → relevant future platform document (13–17)

---

## Platform State

| Layer | Status |
|-------|--------|
| Foundation (M0) | Complete, frozen |
| Control Plane (M1) | Complete, frozen |
| Intelligence Engines (M2) | Complete, frozen |
| Quality Layer (M3) | Complete, frozen |
| Specification (M3.4) | Complete |
| Provider Runtime (M4) | Planned |
| Workflow (M5) | Planned |
| Agent (M6) | Planned |
| Human (M7) | Planned |
| Plugin (M8) | Planned |
| Governance (M9) | Planned |
| Analytics (M10) | Planned |

---

## Canonical Implementation Location

```
src/platform/intelligence/
```

Supplementary module documentation exists within each module's `README.md` and `docs/` folder. This specification is the authoritative cross-module reference.

---

## Architecture Change Proposals

Structural changes to frozen modules require an ACP. No ACPs are pending for v1.0.

---

## Version

**UNAGENCY Intelligence Operating System Specification v1.0**

Covers Milestones M0 through M3.4.
