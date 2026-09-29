/**
 * CDF 2.0 canonical contract bridge (backend).
 *
 * Authoritative definitions live in:
 *   Unagency-frontend/packages/api/src/domain/cdf
 *
 * Backend consumes the same module via monorepo relative import (strangler).
 * Deployments that ship backend without the frontend tree must sync this path
 * or vendor a generated mirror — see docs/cdf/CDF_2_0_CANONICAL_CONTRACT.md.
 */

export {
  CDF_CONTRACT_VERSION,
  CDF_ACTION_CATALOG,
  CDF_CANONICAL_SERVICES,
  CDF_SERVICE_ALIASES,
  getCdfCanonicalRegistry,
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
  listCdfCanonicalPhases,
  countCdfCanonicalPhases,
  computeCdfContractHash,
  validateCdfCanonicalRegistry,
  assertValidCdfCanonicalRegistry,
  projectCanonicalServiceToLegacy,
  buildLegacyCdfConfigsFromCanonical,
  resolveLegacyCdfConfigFromCanonical,
  listLegacyCdfServiceIdsFromCanonical,
  canonicalPhaseAllowsNonVisualReady,
  nextWorkForPhase,
  toLegacyNextWork,
  toLegacyTransitionAction,
  fromLegacyTransitionAction,
  resolveCdfPhaseDefinition,
  resolveCdfPhaseExecutionContract,
  resolveStructuredEmissionPolicy,
  resolveProductStructuredStampPolicy,
  assertOmitStructuredOutputCompatibleWithContract,
  resolveCdfPhaseDependencies,
  tryResolveCdfPhaseDependencies,
  continuityStampsFromExecutionContract,
  resolveCdfGenerationStatusMessage,
  isDirectRoutesSyntheticExecutionId,
  isRouteVisualProductAction,
  messageSatisfiesCdfPhaseDeliverable,
  isValidCdfPhaseExecutionTarget,
  normalizeServiceIdForLookup,
  resolveDependencyRequiredRole,
  tryResolveDependencyRequiredRole,
  deriveDependencyRequiredRole,
  rolePreferenceForDependencyRole,
  isCdfDependencyRequiredRole,
  upstreamCanSatisfyRequiredRole,
  CdfDependencyContractError,
  CDF_DEPENDENCY_REQUIRED_ROLES,
  fnv1a32,
  findCdfPhaseByArtifactKey,
  resolveCdfPresentationCategory,
  resolveCdfPresentationCategoryForArtifactKey,
  resolveCdfRouteInputRequirement,
  composeCdfRouteDescWithInput,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf";

export type {
  CdfPhaseDefinition,
  CdfPhaseExecutionContract,
  CdfExecutionStrategy,
  CdfDependencyRequiredRole,
  CdfResolvedDependency,
  CdfPhaseDependency,
  CdfProductSelectionAutoAdvance,
  ResolveCdfPhaseDependenciesResult,
  ResolveDependencyRequiredRoleResult,
  CdfDependencyContractErrorCode,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf";
