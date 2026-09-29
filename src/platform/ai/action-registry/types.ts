/**
 * Phase 14 — Canonical ActionDefinition contract (declarative only).
 * Does not execute actions. Does not compose prompts. Does not call providers.
 */

/** Controlled action type set matching repository behavior. */
export type ActionType =
  | "generation"
  | "refinement"
  | "selection"
  | "approval"
  | "state_transition"
  | "artifact_operation"
  | "conversation_operation"
  | "deterministic_operation"
  | "rendering"
  | "export"
  | "capability";

/** How the action would eventually execute (Phase 15). */
export type ActionExecutionMode =
  | "MODEL_GENERATION"
  | "DETERMINISTIC_EXECUTION"
  | "STATE_TRANSITION"
  | "ARTIFACT_OPERATION"
  | "RENDER_EXPORT"
  | "CONVERSATIONAL_RESOLUTION";

/** Canonical context component keys (reference Phase 2–9A; do not embed schemas). */
export type ActionContextComponent =
  | "current_instruction"
  | "requirements"
  | "constraints"
  | "exclusions"
  | "selections"
  | "approved_decisions"
  | "resolved_reference"
  | "working_memory"
  | "multimodal_context"
  | "cdf_session"
  | "cdf_phase"
  | "cdf_context"
  | "upstream_artifact"
  | "active_brief"
  | "production_spec"
  | "output_contract"
  | "authority"
  | "configuration"
  | "provider_model"
  | "user_selection";

export type ActionSideEffectLevel =
  | "NONE"
  | "READ_ONLY"
  | "MUTATING"
  | "EXTERNAL_SIDE_EFFECT";

/** Authoritative source registries (do not duplicate their definitions). */
export type ActionSourceRegistry =
  | "cdf_action_catalog"
  | "cdf_canonical_phases"
  | "cdf_state_machine"
  | "cti_conversational_actions"
  | "platform_capability_registry"
  | "cdf_artifact_operations"
  | "cdf_renderer_registry"
  | "canonical_semantic"; // only when no prior registry exists

export type ActionAuthorizationRequirement =
  | "organization"
  | "project"
  | "cdf_session_ownership"
  | "conversation_membership"
  | "artifact_ownership"
  | "user_permission"
  | "external_integration";

export type ActionInputContract = {
  readonly required: readonly ActionContextComponent[];
  readonly optional: readonly ActionContextComponent[];
};

export type ActionOutputContract = {
  /** Existing contract reference — not a duplicated schema. */
  readonly kind:
    | "cdf_transition_result"
    | "artifact_version"
    | "cdf_session_state"
    | "selection"
    | "approval"
    | "render_result"
    | "export_result"
    | "generation_result"
    | "conversational_action_resolution"
    | "capability_definition"
    | "none";
  readonly artifactKey?: string;
  readonly notes?: string;
};

export type ActionDefinition = {
  readonly actionId: string;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly domain: string;
  readonly actionType: ActionType;
  readonly executionMode: ActionExecutionMode;
  readonly inputContract: ActionInputContract;
  readonly outputContract: ActionOutputContract;
  readonly requiredContext: readonly ActionContextComponent[];
  readonly optionalContext: readonly ActionContextComponent[];
  readonly authorizationRequirements: readonly ActionAuthorizationRequirement[];
  readonly sideEffectLevel: ActionSideEffectLevel;
  readonly deterministic: boolean;
  readonly supportsDryRun: boolean;
  readonly sourceRegistry: ActionSourceRegistry;
  readonly sourceReference: string;
  readonly enabled: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type ResolveActionResult =
  | { readonly ok: true; readonly action: ActionDefinition }
  | {
      readonly ok: false;
      readonly code:
        | "UNKNOWN_ACTION"
        | "UNSUPPORTED_VERSION"
        | "ACTION_DISABLED";
      readonly message: string;
      readonly actionId: string;
      readonly version?: string;
      readonly availableVersions?: readonly string[];
    };

export const ACTION_REGISTRY_CONTRACT_VERSION = "14.0.0" as const;
