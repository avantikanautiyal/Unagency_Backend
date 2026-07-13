# Provider Runtime — ACP Report (M4.1)

Two **non-blocking** Architecture Change Proposals. No frozen module was
modified during M4.1; these document integration wiring for later milestones.

---

## ACP-R1: Planning → Runtime request bridge

**Problem.** `ProviderExecutionRequest` is a provider-independent projection.
Nothing yet converts an approved `ExecutionPlan` (+ `CompiledPrompt`) into a
`ProviderExecutionRequest`.

**Impact.** Callers must currently assemble requests manually (or via the
builder). End-to-end plan → provider execution needs a small mapping layer.

**Proposed solution.** Add a `PlanToProviderRequestMapper` in a composition
layer (M4.2 or gateway integration) that reads the plan's provider selection,
retry, and timeout plans and emits a `ProviderExecutionRequest`. The runtime
and its contracts stay unchanged.

**Affected modules.** New mapper (composition layer only). Runtime untouched.

**Migration.** Additive; introduce alongside the first concrete adapter.

**Priority.** Medium.

---

## ACP-R2: Barrel / gateway exposure of the runtime

**Problem.** To honor the "do not modify existing modules" rule, the runtime is
**not** exported from the frozen `providers/index.ts`, and the gateway does not
yet route to it.

**Impact.** Consumers import from `providers/runtime` directly. Business modules
should ultimately reach provider execution only through the gateway.

**Proposed solution.** As an additive change, add
`export * from "./runtime";` to `providers/index.ts` and wire the runtime into
the gateway/orchestrator composition root (this aligns with M3.5 ACP-001,
gateway pipeline orchestration).

**Affected modules.** `providers/index.ts` (one additive line), gateway
composition root (wiring only). No contract changes.

**Migration.** Additive; perform during gateway pipeline integration.

**Priority.** Low.

---

## Summary

| ID | Title | Priority | Blocking M4.2 |
|----|-------|----------|---------------|
| ACP-R1 | Planning → Runtime request bridge | Medium | No |
| ACP-R2 | Barrel / gateway exposure | Low | No |

No blocking ACPs. The Provider Runtime is complete and self-contained.
