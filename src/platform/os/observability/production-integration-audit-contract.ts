/**
 * Priority 3 — Production integration audit contract.
 */

export type ProductionAuditStageStatus =
  | "PASS"
  | "FAIL"
  | "SKIPPED"
  | "CONDITIONAL"
  | "NOT_AUTOMATED";

export type ProductionIntegrationAuditEntry = {
  readonly stage: string;
  readonly expectedComponent: string;
  readonly actualComponent: string;
  readonly invoked: boolean;
  readonly status: ProductionAuditStageStatus;
  readonly evidence: string;
  readonly provenance?: string;
  readonly failureCategory?: string;
  readonly integrityStatus?: "PASS" | "FAIL" | "N/A";
};

export type ProductionIntegrationAuditSummary = {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly conditional: number;
  readonly skipped: number;
  readonly notAutomated: number;
  readonly adaptiveRoutingEnabled: boolean;
  readonly paidProviderCalls: 0;
};

export type ProductionIntegrationAuditResult = {
  readonly entries: readonly ProductionIntegrationAuditEntry[];
  readonly summary: ProductionIntegrationAuditSummary;
  readonly integrationFailures: readonly IntegrationFailureAssessment[];
};

export type IntegrationFailureAssessment = {
  readonly suite: string;
  readonly classification:
    | "missing_test_infrastructure"
    | "environment_configuration"
    | "timeout_resource"
    | "genuine_production_defect";
  readonly evidence: string;
  readonly recommendation: string;
};

export const PRODUCTION_AUDIT_PREFIX = "[UNAGENCY-PRODUCTION-AUDIT]" as const;

export type ProductionLifecycleStageDefinition = {
  readonly stage: string;
  readonly expectedComponent: string;
  readonly actualComponent: string;
  readonly productionEntry: string;
};

export const PRODUCTION_LIFECYCLE_STAGE_CATALOG: readonly ProductionLifecycleStageDefinition[] =
  Object.freeze([
    Object.freeze({
      stage: "request_intake",
      expectedComponent: "ApiGatewayEngine → ExecutionApiService.create",
      actualComponent:
        "dispatch.ts:dispatchController → execution-api-service.ts:ExecutionApiService.create → execution-create-pipeline.ts:runCreateExecution",
      productionEntry: "POST /v1/executions",
    }),
    Object.freeze({
      stage: "classification",
      expectedComponent: "recordClassificationTrace + resolveServiceOutputSpec",
      actualComponent: "execution-create-prepass.ts:runCreatePrepass",
      productionEntry: "runCreatePrepass after beginExecutionTrace",
    }),
    Object.freeze({
      stage: "static_routing",
      expectedComponent: "Matrix routers (image/video/audio/text)",
      actualComponent:
        "execution-create-prepass.ts → *-execution-router.ts + buildDirectProviderBag",
      productionEntry: "runCreatePrepass matrix router branch",
    }),
    Object.freeze({
      stage: "adaptive_routing",
      expectedComponent: "applyAdaptiveRoutingToPrepass (disabled by default)",
      actualComponent:
        "apply-adaptive-routing-prepass.ts → adaptive-routing-decision-service.ts",
      productionEntry: "runCreatePrepass adaptive branch",
    }),
    Object.freeze({
      stage: "provider_selection",
      expectedComponent: "DirectExecutionEngine routing plan",
      actualComponent: "direct-execution-engine.ts:DirectExecutionEngine.run",
      productionEntry: "IntegrationLayerJobExecutor → runDirectProviderExecution",
    }),
    Object.freeze({
      stage: "provider_dispatch",
      expectedComponent: "recordProviderDispatchFromSummary",
      actualComponent:
        "execution-trace.ts:recordProviderDispatchFromSummary ← execution-create-dispatch.ts",
      productionEntry: "sync-direct, distributed-sync, deferred-finalize paths",
    }),
    Object.freeze({
      stage: "structured_output",
      expectedComponent: "DirectExecutionEngine structured output parse",
      actualComponent:
        "direct-execution-engine.ts + structured-output-execution.ts",
      productionEntry: "DirectExecutionEngine.run",
    }),
    Object.freeze({
      stage: "os_materialization",
      expectedComponent: "Website/document/image materializers",
      actualComponent:
        "website-export-materializer.ts, document-export-materializer.ts, materializeSyncImageArtifacts",
      productionEntry: "execution-create-dispatch.ts finalize",
    }),
    Object.freeze({
      stage: "artifact_persistence",
      expectedComponent: "Artifact repository / asyncMedia blob store",
      actualComponent:
        "execution-create-dispatch.ts → persistence.artifacts.save / asyncMedia",
      productionEntry: "runCreateDispatch artifact save",
    }),
    Object.freeze({
      stage: "artifact_hydration",
      expectedComponent: "createArtifactHydrator (evidence path)",
      actualComponent: "production-validation-resolver.ts:resolveProductionValidationAsync",
      productionEntry: "ingestProductionEvidenceAndShadow",
    }),
    Object.freeze({
      stage: "evaluation_plane",
      expectedComponent: "runEvaluationPlane via runArtifactEvaluation",
      actualComponent:
        "artifact-evaluation-engine.ts → evaluation-plane/evaluation-plane.ts",
      productionEntry: "resolveProductionValidationAsync when mediaArtifactIds + deps",
    }),
    Object.freeze({
      stage: "step2_validation",
      expectedComponent: "validateOutputContract (sole contract validator)",
      actualComponent:
        "output-contract-validation-engine.ts:validateOutputContract",
      productionEntry: "resolveProductionValidationAsync",
    }),
    Object.freeze({
      stage: "quality_gate",
      expectedComponent: "applyQualityGate inside Step 2",
      actualComponent: "quality-gate.ts:applyQualityGate",
      productionEntry: "validateOutputContract",
    }),
    Object.freeze({
      stage: "model_performance_record",
      expectedComponent: "buildProductionPerformanceRecord + append",
      actualComponent:
        "production-record-builder.ts → benchmark-record-store.append",
      productionEntry: "ingestProductionEvidenceAndShadow",
    }),
    Object.freeze({
      stage: "execution_integrity",
      expectedComponent: "buildProductionExecutionIntegrity",
      actualComponent: "production-execution-integrity.ts",
      productionEntry: "ingestProductionEvidenceAndShadow",
    }),
    Object.freeze({
      stage: "durable_observability",
      expectedComponent: "schedulePersistExecutionObservability",
      actualComponent:
        "persist-execution-observability.ts → IExecutionObservabilityStore.finalize",
      productionEntry: "ingestProductionEvidenceAndShadow after trace finalize",
    }),
  ]);
