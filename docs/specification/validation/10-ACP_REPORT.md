# Architecture Change Proposal Report

**Milestone:** M3.5  
**Platform:** UNAGENCY Intelligence OS v1.0  
**Status:** 6 non-blocking ACPs — 0 blocking

---

## ACP Process

Architecture Change Proposals (ACPs) document identified improvements that require architectural consideration. During M3.5 validation, no issues warranted immediate implementation. All proposals are non-blocking for M4 entry.

---

## ACP Summary

| ID | Title | Priority | Blocking M4 |
|----|-------|----------|-------------|
| ACP-001 | Gateway Pipeline Orchestration | High | No |
| ACP-002 | Extract ExecutionPriority to Shared | Medium | No |
| ACP-003 | Deprecate Compatibility Shims | Medium | No |
| ACP-004 | Restrict Public Export Surface | Low | No |
| ACP-005 | Align Platform Version Label | Low | No |
| ACP-006 | Move Renderer Target Types to Provider Platform | Low | No |

---

## ACP-001: Gateway Pipeline Orchestration

**Problem:** The gateway composition root (`gateway/factories/platform-composition-root.ts`) wires only the control plane (execution planning, orchestrator, runtime). M2 engines (context, knowledge, prompt compiler, memory) and M3 engines (evaluation, artifacts, learning) are independently composable but not integrated into the gateway execution path.

**Impact:** Business modules invoking the gateway receive execution results without the full intelligence pipeline (context assembly, knowledge packaging, prompt compilation, evaluation, artifact creation, memory ingestion, learning signals). End-to-end pipeline execution requires manual composition outside the gateway.

**Proposed Solution:** Add a `PipelineOrchestrator` (or extend gateway) that wires the complete pipeline:

```
CapabilityRequest → Plan → Context → Knowledge → CompiledPrompt
→ [Provider M4] → ExecutionResult → Evaluation → Artifact → Memory → Learning
```

Wire M2/M3 engine factories in `PlatformCompositionRoot` without modifying frozen engine modules. Gateway exposes optional pipeline mode alongside existing control-plane-only mode.

**Affected Modules:** Gateway (wiring only), Platform Composition Root

**Migration Strategy:**
1. Add pipeline orchestration interface to gateway contracts
2. Wire existing engine factories in composition root
3. Gateway delegates to pipeline orchestrator when full pipeline requested
4. Existing control-plane-only path remains default until M4 provider runtime is available

**Priority:** High

---

## ACP-002: Extract ExecutionPriority to Shared Contracts

**Problem:** The `context` module imports `ExecutionPriority` from `execution-planning/contracts`. This creates a Layer 5 → Layer 3 contract dependency that violates strict layering (intelligence engines should not depend on planning contracts).

**Impact:** Low functional impact — it is a type-only import. However, it couples the context engine to execution planning's contract surface, making independent evolution harder.

**Proposed Solution:** Move `ExecutionPriority` enum/type to `shared/contracts/` or `shared/types/`. Both `execution-planning` and `context` import from shared. No behavioral change.

**Affected Modules:** `shared`, `execution-planning/contracts`, `context/contracts`

**Migration Strategy:**
1. Add `ExecutionPriority` to shared contracts
2. Update imports in execution-planning and context
3. Re-export from execution-planning for backward compatibility (deprecated)
4. Remove re-export in next major version

**Priority:** Medium

---

## ACP-003: Deprecate Compatibility Shims

**Problem:** Legacy module paths remain for backward compatibility:
- `execution-planner/` (superseded by `execution-planning/`)
- `provider-capability-matrix/` (top-level, also under `providers/`)
- Top-level `registry/` (superseded by `capability-registry/`)

**Impact:** Developer confusion about canonical module locations. Duplicate export paths in platform index. Increased maintenance surface for re-exports.

**Proposed Solution:** Mark shim paths as `@deprecated` in exports. Document canonical paths in specification. Remove shims in v2.0 after migration period.

**Affected Modules:** `execution-planner/`, `provider-capability-matrix/`, `registry/`, `platform/intelligence/index.ts`

**Migration Strategy:**
1. Add deprecation notices to shim exports
2. Update all internal imports to canonical paths
3. Update documentation to reference canonical paths only
4. Remove shims in v2.0 (post-M4)

**Priority:** Medium

---

## ACP-004: Restrict Public Export Surface

**Problem:** `src/platform/intelligence/index.ts` publicly exports the `providers` module. Business modules should interact exclusively through the gateway, not directly with provider internals.

**Impact:** Low — no current business module imports detected. Risk of future coupling if developers import provider internals directly, bypassing gateway governance.

**Proposed Solution:** Remove `providers` from the public platform export surface. Export provider interfaces only through gateway contracts or a dedicated provider SDK entry point (M4). Internal platform modules continue to import providers directly.

**Affected Modules:** `platform/intelligence/index.ts`

**Migration Strategy:**
1. Audit all imports of `providers` from platform index
2. Change to direct module path imports for internal consumers
3. Remove `providers` from public barrel export
4. Document gateway as sole business entry point

**Priority:** Low

---

## ACP-005: Align Platform Version Label

**Problem:** Application config (`config/app.config.ts`) reports `platformVersion: '0.1.0-m0'` while the Platform Specification v1.0 declares the architecture as version 1.0.

**Impact:** Cosmetic only. No functional impact. May cause confusion in telemetry, logging, and deployment manifests.

**Proposed Solution:** Update config `platformVersion` to `1.0.0` to align with specification. Alternatively, introduce separate `architectureVersion` and `implementationVersion` fields.

**Affected Modules:** `config/app.config.ts`

**Migration Strategy:**
1. Update version string in config
2. Verify no hardcoded version checks depend on `0.1.0-m0`

**Priority:** Low

---

## ACP-006: Move Renderer Target Types to Provider Platform

**Problem:** `IPromptRenderer.target` in `prompt-compiler/interfaces/prompt-ports.ts` includes a union type with provider name strings (`'openai' | 'anthropic' | 'neutral' | ...`). This places provider-specific knowledge in the prompt compiler module.

**Impact:** Low — these are string literals, not SDK imports. However, adding new providers requires modifying prompt compiler types rather than registering through the provider platform.

**Proposed Solution:** Move renderer target type definitions to `providers/contracts/`. Prompt compiler references `ProviderId` or `RendererTarget` from provider contracts. New providers register renderers without touching prompt compiler.

**Affected Modules:** `prompt-compiler/interfaces/`, `providers/contracts/`

**Migration Strategy:**
1. Define `RendererTarget` type in provider contracts
2. Update `IPromptRenderer` to reference provider contract type
3. M4 provider adapters implement renderer registration
4. Deprecate inline union in prompt compiler

**Priority:** Low

---

## ACP Decision Matrix

| ACP | Implement Before M4 | Implement During M4 | Defer Post-M4 |
|-----|--------------------|--------------------|---------------|
| ACP-001 | | Recommended | |
| ACP-002 | | | Yes |
| ACP-003 | | | Yes (v2.0) |
| ACP-004 | | | Yes |
| ACP-005 | | Yes (trivial) | |
| ACP-006 | | Recommended | |

---

## Blocking ACPs

**None.** All six ACPs are improvements that do not block M4 Provider Execution Platform entry.

---

## ACP Governance

| Rule | Policy |
|------|--------|
| Frozen module contracts | No changes without ACP approval |
| New modules (M4+) | No ACP required — additive by design |
| Gateway wiring changes | ACP recommended but not blocking |
| Shared contract extraction | ACP required (ACP-002) |
| Public API surface changes | ACP required (ACP-004) |
| Deprecation | ACP required (ACP-003) |

---

## Conclusion

Six non-blocking Architecture Change Proposals have been documented. Zero blocking ACPs prevent platform certification. ACP-001 (gateway pipeline orchestration) is recommended for implementation during M4 to enable end-to-end intelligence pipeline execution.
