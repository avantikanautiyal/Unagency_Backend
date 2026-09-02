# Understanding the UNAGENCY Intelligence Platform

**Purpose of this document:** Help you understand *what we are building*, *why it exists*, and *what has been done so far* — in plain language.  
**Architecture note:** Execution runs via the thin/direct provider path (`src/platform/direct/`).

> **Historical status (Aug 2026):** Sections below that claim Prompt Compiler, Knowledge Brain, Execution Intelligence, or TaskGraph are **obsolete**. Those layers were removed because they hurt generation quality. Live create is gateway → route → DirectExecutionEngine / async media. A new Creative Intelligence OS will be rebuilt from schemas/memory outward — do not resurrect the old enrichment novel.

---

## The Big Picture

This repository (`unagency-backend`) is the backend for **Prakria Direct** — a business platform used for client work, campaigns, briefs, projects, subscriptions, and related operations (emails, assignments, etc.).

On top of that existing business backend, we are building something new: an **Intelligence Platform** — think of it as the "brain infrastructure" that will eventually power AI features across the product.

The important idea is this:

> **Business features should not each build their own AI integration.**  
> Instead, they should ask one central system: *"Run this intelligence task for me."*

That central system is what we call the **Intelligence Operating System** (or Intelligence Platform).

---

## A Simple Analogy

Imagine a large company that needs to send packages internationally.

**Bad approach:** Every department picks its own courier, negotiates its own rates, tracks packages differently, and keeps no shared records. Marketing uses DHL one way, Sales uses FedEx another way, and nobody can answer "what did we ship last Tuesday?"

**Good approach:** There is a **logistics department**. Departments say *"ship this box to Paris by Friday"* and the logistics team handles carrier selection, tracking, retries, cost limits, and record-keeping.

Our Intelligence Platform is that logistics department — but for AI work instead of shipping.

- **Business modules** (campaigns, briefs, content tools) = departments that need something done
- **The Gateway** = the front desk where requests are submitted
- **Planning & orchestration** = deciding *how* and *where* the work runs
- **AI providers** (OpenAI, Anthropic, Gemini, etc.) = couriers that actually do the work
- **Artifacts & evaluation** = the permanent records and quality checks

---

## What Problem Are We Solving?

Without a platform like this, every new AI feature tends to:

1. **Hard-code a specific provider** ("just use GPT-4 here") — which makes switching providers painful
2. **Duplicate logic** — context building, retries, error handling copied everywhere
3. **Leave no audit trail** — hard to explain what was sent to the model and what came back
4. **Mix business rules with AI calls** — a campaign controller shouldn't know about API keys and token limits
5. **Make quality inconsistent** — no shared way to evaluate if an AI output was good

We are building the opposite: **one governed, reusable, auditable system** for all intelligence work.

---

## How a Request Is Supposed to Work (The Story)

Here is the journey of a single intelligence request, explained step by step.

### Step 1: A business feature makes a request

Example: A content tool wants to summarize a client brief.

It does **not** call OpenAI. It calls the **Intelligence Gateway** and says something like:

*"Please run the `summarize` capability for organization X, workspace Y, with this input."*

This is a deliberate design choice. Business code gets a simple, stable API.

### Step 2: Planning — "How should we do this?"

The **Execution Planner** looks at:

- What capabilities exist and what they need
- Which AI providers *could* handle this (based on a capability matrix)
- Policies (cost limits, retries, compliance rules, etc.)

It produces an **Execution Plan** — a blueprint that says *how* the work should run, including which provider to use. **Only the planner** makes provider-selection decisions. No other module is allowed to pick providers on its own.

### Step 3: Orchestration — "Let's run the plan"

The **Orchestrator** takes the plan and coordinates the actual execution through the **Execution Runtime**. The runtime manages the lifecycle: started → running → completed/failed/cancelled, with snapshots along the way.

Think of the orchestrator as a project manager and the runtime as the task tracker.

### Step 4: Intelligence preparation (before talking to AI)

Before any provider is called, the platform can build:

| Piece | What it does (in plain terms) |
|-------|-------------------------------|
| **Context** | Gathers everything relevant about *this* request — who, what workspace, what task, what constraints |
| **Knowledge** | Finds and ranks relevant information (docs, facts, prior data) |
| **Prompt Compiler** | Turns context + knowledge + a template into a final prompt — without baking in any one provider's format |
| **Memory** | Remembers past experiences that might help this request |

These are **provider-independent**. The same context and prompt logic should work whether we use OpenAI or Anthropic.

### Step 5: Provider execution (the part still being built)

This is where the request would actually reach an external AI service. The flow we are building:

1. **Routing** — score and rank provider options (cost, latency, quality, compliance)
2. **Negotiation** — final yes/no: *"Is this provider allowed to run this request right now?"* (budget, region, features, identity)
3. **Runtime** — execute with retries, timeouts, circuit breakers, cancellation
4. **Adapter** — translate between our canonical format and provider-specific formats
5. **SDK / Transport** — the actual connection layer to the vendor API

**Today:** Steps 1–4 above (planning through memory) are built and tested. Step 5 has full structure and logic, but **no real API calls yet** — wrappers return "not implemented" placeholders.

### Step 6: After the work is done — quality and learning

| Piece | What it does |
|-------|--------------|
| **Evaluation** | Judges whether the output met quality criteria; can flag things for human review |
| **Artifacts** | Creates permanent, immutable records of what happened (like version-controlled snapshots of intelligence work) |
| **Learning** | Observes patterns and suggests improvements — but does **not** automatically change behavior |

Artifacts are especially important. They are meant to be the **source of truth** for "what did the AI do, with what inputs, and what was the result?" — critical for enterprise trust and debugging.

---

## What Has Actually Been Built?

We organize work in **milestones**. Here is what each phase delivered, in human terms.

### Foundation (M0) — "The plumbing"

We built the basics every module needs:

- Common types, error handling, and a `Result` pattern (success or failure, not random thrown errors)
- Configuration, events, security contracts, telemetry hooks
- A **kernel** that boots the platform, wires dependencies together, tracks health, and registers modules
- Testing scaffolding

**Status:** Done. These modules are considered **frozen** — we don't change them casually.

### Control Plane (M1) — "The air traffic control"

This is the core operational layer:

| What we built | What it means |
|---------------|---------------|
| **Capability Registry & Catalog** | A catalog of "things the platform can do" (like `echo`, `summarize`, `translate`) with metadata |
| **Provider Platform (metadata)** | Registry of AI providers, what features they support, health status — but not live calls yet |
| **Execution Planning** | Turns a capability request into an execution plan |
| **Execution Runtime** | Manages execution sessions and state |
| **Orchestrator** | Coordinates running a plan end-to-end |
| **Gateway** | The **only door** business code should use |

**What works today:** You can bootstrap the gateway and invoke **mock capabilities** (`echo`, `uppercase`, `summarize_mock`, `translate_mock`) that return deterministic fake results. The full planning → orchestration → runtime pipeline runs for real — just without external AI.

**Status:** Done and frozen.

### Intelligence Engines (M2) — "Preparing the mind"

| Engine | Purpose |
|--------|---------|
| **Context** | Build structured context for a request |
| **Knowledge** | Discover, rank, and filter relevant knowledge |
| **Prompt Compiler** | Compile templates into provider-neutral prompts |
| **Memory** | Store and retrieve experience-layer memory |

**Status:** Done and frozen. All work in-memory for now (no database backends wired).

### Quality Layer (M3) — "Did it work? What did we learn?"

| Platform | Purpose |
|----------|---------|
| **Evaluation** | Score outputs, confidence, review signals |
| **Artifacts** | Create immutable intelligence records with lineage and checksums |
| **Learning** | Generate advisory recommendations from historical data |

**Status:** Done and frozen.

### Specification (M3.4) — "The rulebook"

We wrote a full architecture specification (`docs/specification/`) — 22 documents covering vision, architecture, dependency rules, pipeline, every domain model, security, roadmap, and glossary. This is the authoritative reference for *how the system is supposed to work*.

**Status:** Complete.

### Provider Runtime (M4) — "Actually talking to AI" *(in progress)*

This is the current frontier. We have built the **structure and logic** for:

- **Provider Runtime** — sessions, retries, timeouts, circuit breakers, queues
- **Identity & Trust** — credential management, authorization, trust validation (in-memory)
- **Negotiation** — pre-flight checks before execution is allowed
- **Adapters** — translate between canonical and provider-specific formats
- **Transport** — abstraction for HTTP/SDK/gRPC (no real network yet)
- **SDK Platform** — wrapper interfaces for OpenAI, Anthropic, Gemini, etc. (all placeholders)
- **Integration** — install, register, discover, version providers
- **Routing** — scoring, ranking, failover strategies
- **Execution Intelligence** — optimize quality *before* calling a provider
- **Execution Optimization** — learn from history and suggest improvements

**Status:** Architecturally complete with **443 automated tests passing**. The missing piece is wiring **one real provider** (actual API calls) and connecting it end-to-end through the gateway.

### Not started yet (planned)

- **Workflows** — multi-step intelligence pipelines with human approval steps
- **Agents** — autonomous goal-directed AI loops
- **Human review platform** — queues, expert routing, approvals
- **Plugins** — third-party extensions
- **Governance** — tenant admin, compliance, cost controls
- **Analytics** — dashboards for quality, cost, and usage

---

## How This Relates to the Rest of the App

AI execution lives under `src/platform/` as a modular stack:

```
src/platform/direct/           ← DirectExecutionEngine (prompt → provider)
src/platform/api/              ← Enterprise Gateway (/v1/*)
src/platform/providers/        ← Provider runtime, routing, negotiation
src/platform/os/               ← Governance, refinement, delivery, evaluation
src/controllers/               ← Legacy business API routes
src/models/                    ← MongoDB models for business data
```

The Enterprise Gateway is mounted from `src/app.ts` when `ENTERPRISE_API_EXECUTION_MODE` is `simulated` or `live`. Product features call `POST /v1/executions` through the Gateway SDK — not internal platform modules directly.

---

## Key Design Principles (Why Things Are Built This Way)

Understanding these principles will save you a lot of confusion:

### 1. One front door

Business code talks to the **Gateway** only. It should never import internal modules like the planner or provider registry directly.

### 2. Providers are interchangeable

OpenAI, Anthropic, Gemini are **execution engines**, not owners of our architecture. We should be able to swap or add providers without rewriting business logic.

### 3. Frozen means frozen

Modules from M0 through M3 are **architecturally locked**. If you need to change them, you write an **Architecture Change Proposal (ACP)** first. This prevents the foundation from slowly breaking.

### 4. No secrets leaking upward

The identity system gives the runtime a **credential session** — the runtime never sees raw API keys or knows how authentication works internally.

### 5. Everything important gets recorded

Artifacts are the permanent record. If we can't explain what happened, we can't trust the system in an enterprise setting.

### 6. Learning advises, it doesn't auto-change

The learning platform suggests improvements. It does **not** silently modify prompts or behavior — that would be unsafe without human oversight.

### 7. Test everything in isolation

We have 101 test suites covering the intelligence platform. Run them with:

```bash
npx jest tests/platform/intelligence
```

---

## What "Done" Looks Like vs What We Have Now

| Capability | Now | Target |
|------------|-----|--------|
| Plan how to run a capability | ✅ Working | ✅ |
| Orchestrate execution lifecycle | ✅ Working | ✅ |
| Build context, knowledge, prompts | ✅ Working (in-memory) | + database backends |
| Evaluate outputs, create artifacts | ✅ Working (in-memory) | + persistence |
| Mock capabilities via gateway | ✅ Working | ✅ |
| Call a real AI provider | ❌ Placeholders only | Wire first provider |
| Business API uses intelligence | ❌ Not connected | Gateway in controllers |
| Workflows, agents, human review | ❌ Not started | Future milestones |

---

## A Day-in-the-Life Example (Future State)

To make this concrete, imagine the future:

1. A client creates a **brief** in Prakria Direct
2. The brief controller calls the gateway: `invokeCapability("summarize_brief", { briefId, ... })`
3. The planner picks the best provider based on cost and quality policies
4. Context engine pulls client history, brand guidelines, and brief content
5. Knowledge engine finds relevant past campaigns
6. Prompt compiler builds the final prompt
7. Negotiation confirms the provider is allowed for this tenant and budget
8. Runtime executes via OpenAI (or whichever provider was chosen)
9. Evaluation scores the summary quality
10. An artifact is stored: permanent record of inputs, prompt, output, provider, timestamps
11. Learning engine notes "summaries for this client type work better with strategy X"
12. The summary is returned to the client UI

**Today**, steps 3–6 and 9–11 exist as tested modules. Steps 7–8 need real provider wiring. Step 1–2 need controller integration.

---

## Where to Look in the Codebase

| If you want to understand… | Start here |
|----------------------------|------------|
| Direct execution engine | `src/platform/direct/` |
| Enterprise API gateway | `src/platform/api/` |
| Provider runtime | `src/platform/providers/runtime/` |
| Post-provider OS (governance, delivery) | `src/platform/os/` |
| Any specific module | `<module>/README.md` inside `src/platform/intelligence/` |

---

## What You Should Take Away

1. **We are building AI infrastructure, not a single AI feature.** The platform is meant to serve many features over time.

2. **Most of the hard architectural work is done.** Planning, engines, quality layer, and provider scaffolding exist and are tested.

3. **The next big leap is making it real** — one actual provider connection, end-to-end through the gateway, then business API integration.

4. **Respect the boundaries.** The architecture only works if modules stay in their lanes. The gateway is the front door; the planner owns provider selection; providers are leaves at the bottom.

5. **Read the spec when in doubt.** `docs/specification/` is the source of truth for intended behavior. Module READMEs explain each piece in more detail.

6. **Ask "which milestone is this?"** If you're touching M0–M3, stop and check if an ACP is needed. If you're working on M4 provider wiring, you're in the right place.

---

## Glossary (Plain English)

| Term | Meaning |
|------|---------|
| **Capability** | A named intelligence task the platform can perform (e.g. summarize, translate) |
| **Gateway** | The single public API business code uses |
| **Execution Plan** | A blueprint for how a capability should run |
| **Provider** | An external AI service (OpenAI, Anthropic, etc.) |
| **Artifact** | A permanent, immutable record of an intelligence operation |
| **Frozen module** | Architecturally locked; changes need an ACP |
| **ACP** | Architecture Change Proposal — formal request to change frozen design |
| **In-memory** | Data lives in process memory only; lost on restart (temporary for development) |
| **Placeholder** | Code structure exists but doesn't do the real thing yet (e.g. SDK wrappers) |

---

*This document describes the state of the platform as of July 2026. For current execution architecture, see `src/platform/direct/` and `src/platform/api/`.*
