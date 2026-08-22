/**
 * Phase 0 — explicit implementation status for OS layers.
 * Do not treat a TypeScript interface as an implemented product feature.
 */

export type OsLayerImplementationStatus =
  | "implemented"
  | "partial"
  | "not_implemented"
  | "infrastructure_only"
  | "planned";

export interface OsLayerContractMeta {
  readonly layerId: string;
  readonly status: OsLayerImplementationStatus;
  readonly notes: string;
}

/** Authoritative Phase 0 status of intended OS layers (honest, not aspirational). */
export const OS_LAYER_STATUS: readonly OsLayerContractMeta[] = Object.freeze([
  {
    layerId: "BriefIntelligence",
    status: "implemented",
    notes:
      "Phase 1: deterministic NL→StructuredBrief on ExecutionApiService; consumed by IntegrationPipeline via metadata/capability hints.",
  },
  {
    layerId: "BrandIntelligence",
    status: "implemented",
    notes:
      "Phase 2: structured BrandContext on ExecutionApiService after Brief; rendered into provider prompt. BrandGuard (post-gen) is Phase 6.",
  },
  {
    layerId: "KnowledgeIntelligence",
    status: "implemented",
    notes:
      "Phase 3: structured KnowledgeContext on ExecutionApiService after Brand; task-aware retrieval; reaches provider prompt as untrusted DATA.",
  },
  {
    layerId: "ExecutionIntelligence",
    status: "implemented",
    notes:
      "Phase 4: deterministic ExecutionPlan (DAG) from Brief+Brand+Knowledge on ExecutionApiService; does NOT execute tasks (TaskGraphExecutor Phase 5).",
  },
  {
    layerId: "Orchestrator",
    status: "partial",
    notes:
      "Canonical: IntegrationPipeline as single-execution coordinator. Phase 5 TaskGraphExecutor handles multi-task DAG runs.",
  },
  {
    layerId: "TaskGraphExecutor",
    status: "implemented",
    notes:
      "Phase 5: executes APPROVED_FOR_EXECUTION OsExecutionPlan DAG via Integration capability path; bounded parallel leaves; resume/cancel/idempotent claims. Phase 8: durable TaskGraphRunStore + queued per-task workers (default execute remains in-process).",
  },
  {
    layerId: "CapabilityRegistry",
    status: "partial",
    notes: "Real CapabilityRegistry seeded for production negotiation (Phase 0).",
  },
  {
    layerId: "ModelRouter",
    status: "partial",
    notes: "Wired on sync Integration path; async media uses modality routers.",
  },
  {
    layerId: "ExecutionRuntime",
    status: "implemented",
    notes: "Provider runtime + failover on sync path; LIVE/SIMULATED modes.",
  },
  {
    layerId: "OutputContractRegistry",
    status: "partial",
    notes: "Tool/structured-output contracts exist; cross-capability registry is Phase 0 foundation only.",
  },
  {
    layerId: "EvaluationEngine",
    status: "implemented",
    notes:
      "Phase 6: OsEvaluationEngine + EvaluatorRegistry (SpecGuard, BrandGuard, Quality); findings only — does not govern. Phase 8: append-only durable evaluation ledger.",
  },
  {
    layerId: "ValidationEngine",
    status: "infrastructure_only",
    notes: "M9.1 offline certification harness; not request-path validation.",
  },
  {
    layerId: "BrandGuard",
    status: "implemented",
    notes:
      "Phase 6: post-generation brand compliance evaluator (tone/avoid/prohibited); brand context treated as DATA.",
  },
  {
    layerId: "SpecGuard",
    status: "implemented",
    notes:
      "Phase 6: post-generation specification / output-contract compliance evaluator.",
  },
  {
    layerId: "GovernanceEngine",
    status: "implemented",
    notes:
      "Phase 6: policy-versioned decisions CONTINUE/RETRY/BLOCK/HUMAN_REVIEW/REJECT/APPROVE; human review gate; technical success ≠ approval. Phase 8: durable governance + human-review repositories.",
  },
  {
    layerId: "ApprovalService",
    status: "implemented",
    notes:
      "Phase 6 human review + Phase 7 approval bound to artifact version; no approval → no delivery.",
  },
  {
    layerId: "DeliveryService",
    status: "implemented",
    notes:
      "Phase 7: approval-gated, version-bound delivery with idempotent receipts (export + storage adapters). Phase 8: durable receipts, optional delivery queue/workers.",
  },
  {
    layerId: "RefinementEngine",
    status: "implemented",
    notes:
      "Phase 7: AI/HYBRID structured MCQ feedback (max 5), RefinementSpecification, replan+TaskGraph re-execution, immutable v2. Phase 8: durable sessions; question bank remains deterministic (LLM ranking not required).",
  },
  {
    layerId: "AuditService",
    status: "partial",
    notes: "Execution extras + layer logs + evaluation/governance/refinement/delivery/queue provenance events; Gateway /os/* control-plane APIs added in Phase 8.",
  },
]);

export function getOsLayerStatus(layerId: string): OsLayerContractMeta | undefined {
  return OS_LAYER_STATUS.find((l) => l.layerId === layerId);
}
