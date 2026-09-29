/**
 * Phase 11/12 — Provider-neutral Model Runtime boundary.
 *
 * CanonicalModelRequest remains semantic SoT.
 * Flattening / mapping here is provider representation only.
 * Phase 12 adds deterministic capability assessment + representation plans.
 */

export type {
  ModelRuntimeRepresentationStrategy,
  ModelRuntimeCapabilityState,
  ModelRuntimeCapabilityNote,
  ModelRuntimeProjection,
  ModelRuntimePrepareInput,
  ModelRuntimePrepareResult,
  ModelRuntimeErrorCategory,
} from "./types";

export { MODEL_RUNTIME_SOURCE } from "./types";

export {
  prepareCanonicalModelRuntime,
  assertModelRequestUnchanged,
} from "./prepare";

export {
  assessCmrProviderRepresentation,
  buildProviderRepresentationPlan,
} from "./capability";

export {
  resolveCmrProviderRepresentationProfile,
  type CmrProviderFamily,
  type CmrProviderRepresentationProfile,
} from "./provider-profile";

export {
  PROVIDER_REPRESENTATION_PLAN_SOURCE,
  summarizeRepresentationPlan,
  type ProviderRepresentationPlan,
  type ProviderRepresentationComponent,
  type CmrComponentName,
} from "./representation-plan";

export {
  normalizeProviderExecutionResult,
  type ModelRuntimeNormalizedResult,
} from "./normalize";

export { categorizeProviderRuntimeError } from "./errors";

export {
  emitModelRuntimeMappedTrace,
  emitModelRuntimeFailedTrace,
  getModelRuntimeTraceEventsForTests,
  resetModelRuntimeTracesForTests,
  MODEL_RUNTIME_TRACE_SCOPE,
} from "./trace";
