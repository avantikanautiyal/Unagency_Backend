/**
 * UNAGENCY Studio Engine — product interaction layer.
 *
 * Framework-agnostic contracts for workspaces, canvases, sessions, panels,
 * activities, and widgets. Frontends only render the Studio.
 *
 * Does not create React / React Native / HTML / CSS.
 * Communicates only through Enterprise API Gateway envelopes.
 */

export * from "./contracts";
export * from "./interfaces";
export { StudioEngine } from "./engine/studio-engine";
export {
  STUDIO_TYPE_CONFIGS,
  buildDefaultLayout,
  studioDefinitionFromType,
} from "./templates/studio-types";
export { emptyStudioState, cloneState, diffStates } from "./state/studio-state";
export {
  StudioWorkspaceBuilder,
  StudioAiSessionBuilder,
} from "./builders/studio-builders";
export {
  createStudioPlatform,
  type StudioPlatform,
  type CreateStudioPlatformOptions,
} from "./factories/create-studio-platform";
export {
  isGatewayOnlyChannel,
  assertNoDirectBackendPaths,
} from "./ai/gateway-integration";
