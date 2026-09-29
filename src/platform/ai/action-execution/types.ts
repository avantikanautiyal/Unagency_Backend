/**
 * Phase 15 — Canonical Action Execution contracts.
 * Thin coordination boundary; delegates to existing authoritative executors.
 */

import type {
  ActionAuthorizationRequirement,
  ActionContextComponent,
  ActionDefinition,
  ActionExecutionMode,
  ActionSideEffectLevel,
} from "../action-registry";
import type { CanonicalModelRequest } from "../canonical-model-request";
import type { ModelRuntimePrepareResult } from "../model-runtime";
import type { ContextOrchestrationResult } from "../context-orchestrator";
import type { CdfTransitionRequest, CdfTransitionResult } from "../../cdf/types";
import type {
  CreateArtifactInput,
  CreateArtifactVersionInput,
} from "../../cdf/artifacts/types";
import type { CdfRenderRequest, CdfRenderedFile } from "../../cdf/rendering/types";
import type { ActionResolutionContext } from "../../collaboration/conversational-task-intelligence/action-resolution";
import type { ConversationalAction } from "../../collaboration/conversational-task-intelligence/conversational-task-contract";

export const ACTION_EXECUTION_CONTRACT_VERSION = "15.0.0" as const;

export type ActionExecutionErrorCode =
  | "UNKNOWN_ACTION"
  | "UNSUPPORTED_VERSION"
  | "ACTION_DISABLED"
  | "INVALID_EXECUTION_MODE"
  | "INVALID_INPUT"
  | "MISSING_REQUIRED_CONTEXT"
  | "UNAUTHORIZED"
  | "EXECUTION_NOT_SUPPORTED"
  | "DRY_RUN_UNSUPPORTED"
  | "EXECUTION_FAILED";

/** Presence / binding context — does not contain resolved artifact bodies or prompts. */
export type CanonicalActionExecutionContext = {
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly userId?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly cdfServiceId?: string;
  readonly conversationId?: string;
  readonly channelId?: string;
  /** Declares which ActionContextComponent keys are available (Phase 10+ assemble them). */
  readonly presentContext?: Readonly<
    Partial<Record<ActionContextComponent, boolean>>
  >;
  /** Exact pin identity only — Action Execution does not load ArtifactVersion bodies. */
  readonly upstreamArtifactRef?: {
    readonly artifactId: string;
    readonly version: number;
    readonly artifactKey?: string;
  };
  readonly currentInstruction?: string;
  readonly userSelection?: unknown;
  readonly configuration?: Readonly<Record<string, unknown>>;
};

/**
 * Caller-attested authorization facts from existing auth layers.
 * Action Execution verifies these against ActionDefinition + session/artifact ownership;
 * it does not invent a second permission system.
 */
export type CanonicalActionAuthorizationContext = {
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly userId?: string;
  /** Explicit attestation from existing conversation ACL (fail closed if required but false/missing). */
  readonly conversationAuthorized?: boolean;
  /** Explicit attestation for external integration permission. */
  readonly externalIntegrationAuthorized?: boolean;
  /** Explicit attestation for user permission checks. */
  readonly userPermissionGranted?: boolean;
};

export type CanonicalActionExecutionInput = {
  readonly cdfTransition?: Partial<
    Omit<CdfTransitionRequest, "action" | "organizationId" | "projectId">
  >;
  readonly orchestration?: {
    readonly prompt?: string;
    readonly conversationalInstruction?: string;
    readonly conversationMessages?: readonly unknown[];
    readonly metadata?: Readonly<Record<string, unknown>>;
  };
  readonly artifactCreate?: Omit<
    CreateArtifactInput,
    "organizationId" | "projectId" | "sessionId"
  > & { readonly sessionId?: string };
  readonly artifactCreateVersion?: CreateArtifactVersionInput;
  readonly artifactSelectApprove?: {
    readonly artifactId: string;
    readonly version: number;
  };
  readonly render?: CdfRenderRequest;
  readonly conversational?: ActionResolutionContext;
};

export type CanonicalActionExecutionRequest = {
  readonly actionId: string;
  readonly actionVersion?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly executionId?: string;
  /** When set, must match resolved ActionDefinition.executionMode. */
  readonly executionMode?: ActionExecutionMode;
  readonly input: CanonicalActionExecutionInput;
  readonly executionContext: CanonicalActionExecutionContext;
  readonly authorizationContext: CanonicalActionAuthorizationContext;
  readonly dryRun?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ActionExecutionResultKind =
  | "cdf_transition_result"
  | "artifact_version"
  | "selection"
  | "approval"
  | "render_result"
  | "export_result"
  | "generation_result"
  | "conversational_action_resolution"
  | "capability_definition"
  | "deterministic_result"
  | "none";

export type ActionExecutionSuccessPayload = {
  readonly kind: ActionExecutionResultKind;
  /** Existing executor result — wrapped, not duplicated schemas. */
  readonly value: unknown;
  readonly modelRequest?: CanonicalModelRequest;
  readonly modelRuntime?: ModelRuntimePrepareResult;
  readonly orchestration?: ContextOrchestrationResult;
  readonly cdfTransition?: CdfTransitionResult;
  readonly renderedFile?: CdfRenderedFile;
  readonly conversationalAction?: ConversationalAction;
};

export type ActionExecutionResult =
  | {
      readonly ok: true;
      readonly actionId: string;
      readonly actionVersion: string;
      readonly executionMode: ActionExecutionMode;
      readonly sideEffectLevel: ActionSideEffectLevel;
      readonly dryRun: boolean;
      readonly requestId?: string;
      readonly correlationId?: string;
      readonly executionId?: string;
      readonly result: ActionExecutionSuccessPayload;
      readonly metadata: Readonly<Record<string, unknown>>;
    }
  | {
      readonly ok: false;
      readonly actionId: string;
      readonly actionVersion?: string;
      readonly executionMode?: ActionExecutionMode;
      readonly code: ActionExecutionErrorCode;
      readonly message: string;
      readonly dryRun: boolean;
      readonly requestId?: string;
      readonly correlationId?: string;
      readonly executionId?: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };

export type ActionExecutionAuthCheck = {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly code: "UNAUTHORIZED" | "EXECUTION_NOT_SUPPORTED";
  readonly message: string;
  readonly requirement: ActionAuthorizationRequirement;
};

/** Optional transport hook — existing DirectEngine / ControllableDispatcher only. */
export type ActionExecutionDeps = {
  readonly runGenerationTransport?: (args: {
    readonly modelRequest: CanonicalModelRequest;
    readonly prompt: string;
    readonly metadata: Record<string, unknown>;
    readonly organizationId: string;
    readonly projectId?: string;
    readonly executionId: string;
  }) => Promise<{
    readonly ok: boolean;
    readonly providerInvoked: boolean;
    readonly error?: string;
  }>;
};

export type ResolvedActionExecution = {
  readonly action: ActionDefinition;
  readonly request: CanonicalActionExecutionRequest;
};
