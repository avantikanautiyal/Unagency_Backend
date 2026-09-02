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

/** Authoritative status of active OS layers (honest, not aspirational). */
export const OS_LAYER_STATUS: readonly OsLayerContractMeta[] = Object.freeze([
  {
    layerId: "Orchestrator",
    status: "implemented",
    notes: "Direct provider path: ExecutionApiService → DirectExecutionEngine → ProviderRuntime.",
  },
  {
    layerId: "CapabilityRegistry",
    status: "partial",
    notes: "Real CapabilityRegistry seeded for production negotiation.",
  },
  {
    layerId: "ModelRouter",
    status: "partial",
    notes:
      "Prepass owns matrix/modality routing pins (preferredProviderId/ModelId). A4 sharpenContinuityRoutingPins inherits refine-reuse pins; never rewrites brief.",
  },
  {
    layerId: "ExecutionRuntime",
    status: "implemented",
    notes: "Provider runtime + failover on sync path; LIVE/SIMULATED modes.",
  },
  {
    layerId: "OutputContractRegistry",
    status: "partial",
    notes:
      "Capability-level contracts (partial) + Step 1 service-level canonical Output Contracts (implemented) via ServiceOutputContractRegistry. Coverage audit available.",
  },
  {
    layerId: "EvaluationEngine",
    status: "implemented",
    notes: "OsEvaluationEngine + EvaluatorRegistry; findings only — does not govern.",
  },
  {
    layerId: "BrandGuard",
    status: "partial",
    notes:
      "Evaluator exists, but create finalize typically passes no brand context (BRAND_CONTEXT_MISSING). Wire via Brand Memory before claiming implemented.",
  },
  {
    layerId: "SpecGuard",
    status: "partial",
    notes:
      "Step 2: executes effective Output Contract validation when service/subtype present on finalize path. Legacy capability registry retained for backward compat.",
  },
  {
    layerId: "GovernanceEngine",
    status: "implemented",
    notes: "Policy-versioned decisions CONTINUE/RETRY/BLOCK/HUMAN_REVIEW/REJECT/APPROVE.",
  },
  {
    layerId: "ApprovalService",
    status: "implemented",
    notes: "Human review + approval bound to artifact version; no approval → no delivery.",
  },
  {
    layerId: "DeliveryService",
    status: "implemented",
    notes: "Approval-gated, version-bound delivery with idempotent receipts.",
  },
  {
    layerId: "RefinementEngine",
    status: "implemented",
    notes:
      "AI/HYBRID structured MCQ feedback, RefinementSpecification; direct provider re-run. A4 completeOsRefinement returns continuityMetadata (same packet).",
  },
  {
    layerId: "AuditService",
    status: "partial",
    notes: "Execution extras + layer logs + evaluation/governance/refinement/delivery provenance.",
  },
  // Track A — Smart Continuity (contracts exist; create path unchanged until flagged on)
  {
    layerId: "BrandMemoryPlane",
    status: "partial",
    notes:
      "Phase A1. InMemoryBrandMemoryStore + promote service. Create path unbound until A2 binder.",
  },
  {
    layerId: "IntentGate",
    status: "partial",
    notes:
      "Phase A2. detectIntentGateFromBrief on create when CONTINUITY_CONTEXT_BIND≠off.",
  },
  {
    layerId: "KnowledgeResolver",
    status: "partial",
    notes: "Phase A2. BrandKnowledgeResolver reads canonical/working slots.",
  },
  {
    layerId: "ContextBinder",
    status: "partial",
    notes:
      "Phase A2. Packet + assetIds on metadata; CONTINUITY_CONTEXT_BIND default off. Missing required slots → ASK.",
  },
  {
    layerId: "PostGuards",
    status: "partial",
    notes:
      "Phase A3. Spec/Brand post-guards + ≤1 hard retry on sync path. CONTINUITY_POST_GUARDS default off. Taste → suggestRefine only.",
  },
  {
    layerId: "MultiDeliverableOrchestrator",
    status: "partial",
    notes:
      "Phase A4. Pack planner (CONTINUITY_PACKS). First leaf thin-creates; remaining leaves are plan-only. Default off.",
  },
  {
    layerId: "BriefAssist",
    status: "partial",
    notes:
      "Phase A4. Empty/vague + optInBriefAssist only (CONTINUITY_BRIEF_ASSIST). Default off; never auto-compiles all briefs.",
  },
  {
    layerId: "CampaignMemory",
    status: "partial",
    notes:
      "Phase A5. Packs→working campaign, selection signals, cross-service carry, rebrand archive. CONTINUITY_CAMPAIGN_MEMORY default off.",
  },
  {
    layerId: "ProductIntelligenceUx",
    status: "partial",
    notes:
      "Phase A6. Slot awareness + color contradiction ASK; continuityObservability on diagnostics; approveVersion HTTP. CONTINUITY_PRODUCT_UX default off.",
  },
  {
    layerId: "ApprovePromote",
    status: "partial",
    notes:
      "Phase A1. Hook on approveVersion(brandMemory?) behind CONTINUITY_APPROVE_PROMOTE (default off).",
  },
]);

export function getOsLayerStatus(layerId: string): OsLayerContractMeta | undefined {
  return OS_LAYER_STATUS.find((l) => l.layerId === layerId);
}
