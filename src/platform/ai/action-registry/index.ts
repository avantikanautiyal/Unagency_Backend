/**
 * Phase 14 — Action Registry / Capability Contract.
 * Declarative catalog only. Phase 15 implements execution.
 */

export {
  ACTION_REGISTRY_CONTRACT_VERSION,
  type ActionDefinition,
  type ActionType,
  type ActionExecutionMode,
  type ActionContextComponent,
  type ActionSideEffectLevel,
  type ActionSourceRegistry,
  type ActionAuthorizationRequirement,
  type ActionInputContract,
  type ActionOutputContract,
  type ResolveActionResult,
} from "./types";

export {
  resolveAction,
  listAllActionDefinitions,
  listAvailableActions,
  listGenerationActionsForService,
  resetActionRegistryForTests,
  getActionRegistryContractVersion,
  type ActionDiscoveryContext,
} from "./registry";

export { buildCdfTransitionActions, buildCdfPhaseActions } from "./from-cdf";
export { buildCtiActionDefinitions } from "./from-cti";
export { buildArtifactActionDefinitions } from "./from-artifact";
export { buildCapabilityActionDefinitions } from "./from-capability";
