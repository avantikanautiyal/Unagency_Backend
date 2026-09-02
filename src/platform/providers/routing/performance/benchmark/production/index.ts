/**
 * Step 10 — Production Evidence + Shadow Optimization
 */

export {
  PRODUCTION_BENCHMARK_ID,
  PRODUCTION_BENCHMARK_VERSION,
  BENCHMARK_EVIDENCE_DEFAULTS,
  PRODUCTION_EVIDENCE_DEFAULTS,
  type EvidenceSource,
  type EvidenceMode,
} from "../contracts/evidence-provenance";

export {
  buildProductionPerformanceRecord,
  type ProductionEvidenceInput,
} from "./production-record-builder";

export {
  ingestProductionEvidenceAndShadow,
  scheduleProductionEvidenceAndShadow,
  createProductionEvidenceService,
  type ProductionExecutionEvidenceContext,
  type ProductionEvidenceResult,
  type ProductionEvidenceServiceDeps,
} from "./production-evidence-service";

export {
  resolveProductionValidationAsync,
  type ProductionArtifactEvaluationDeps,
  type ProductionEvaluationStageTrace,
  type ProductionValidationOutcome,
} from "./production-validation-resolver";

export {
  hookProductionEvidenceAfterFinalize,
  type ProductionEvidenceHookInput,
} from "./production-evidence-hook";

export {
  createProductionIntelligenceQueryService,
  defaultProductionIntelligenceQueryService,
  type ProductionIntelligenceQueryService,
} from "./production-intelligence-query";
