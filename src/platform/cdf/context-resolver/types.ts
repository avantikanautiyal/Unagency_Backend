/**
 * CDF 2.0 M2B — Resolved Generation Context types.
 * Context Resolver composes session + ActiveBrief + phase contract.
 * Does not generate, approve, transition, or create artifacts.
 */

import type { CdfRequirementCategory, CdfRequirementPriority } from "../requirements/types";

export type CdfContextResolutionStatus =
  | "ready"
  | "blocked"
  | "requires_clarification"
  | "invalid"
  | "stale";

export type CdfContextSource = "canonical" | "legacy";

export type CdfUpstreamReference = {
  phaseId: string;
  /** Transitional — not a canonical Artifact id (M3). */
  source:
    | "legacy_execution"
    | "legacy_approval_note"
    | "legacy_master"
    | "requirement_decision"
    | "canonical_artifact";
  referenceId?: string;
  label?: string;
  note?: string;
  approvedAt?: string;
};

export type CdfContextRequirementRef = {
  requirementId: string;
  key: string;
  displayValue: string;
  category: CdfRequirementCategory | string;
  priority: CdfRequirementPriority | string;
  explicit: boolean;
  sourceInputId: string;
};

export type CdfContextSelectionRef = {
  phaseId: string;
  label: string;
  routeTitle?: string;
  routeIndex?: number;
  /** Stable choice identity within parent ArtifactVersion when known. */
  choiceId?: string;
  /** Never treat as approval. */
  semantic: "selection";
};

export type CdfContextDecisionRef = {
  phaseId: string;
  label: string;
  artifactId?: string;
  executionId?: string;
  note?: string;
  semantic: "approval";
};

export type CdfContextRefinement = {
  prompt: string;
  scope?: string;
  /** Only set when reliably parsed — never guessed. */
  target?: string;
  ambiguous: boolean;
};

export type CdfPhaseContractSlice = {
  phaseId: string;
  serviceId: string;
  name: string;
  uxType: string;
  generationModality: string;
  artifactType: string;
  artifactKey: string;
  implementationStatus: string;
  dependencyPhaseIds: string[];
  allowNonVisualReady: boolean;
  selectionMode: string;
  approvalMode: string;
  refinementEnabled: boolean;
  refinementScopes: string[];
  /** Phase semantic purpose — survives to provider boundary. */
  entryMessage: string;
  description: string;
  executionStrategy: string;
  choiceNoun?: string;
  textLines?: string[];
  outputLabel?: string;
};

export type CdfContextWarning = {
  code: string;
  message: string;
};

export type CdfContextProvenance = {
  requirementIds: string[];
  sourceInputIds: string[];
  decisionPhaseIds: string[];
  selectionPhaseIds: string[];
  upstreamRefs: Array<{ phaseId: string; source: string; referenceId?: string }>;
};

export type ResolvedGenerationContext = {
  contextId: string;
  contextHash: string;
  status: CdfContextResolutionStatus;
  contextSource: CdfContextSource;
  projectId?: string;
  sessionId: string;
  serviceId: string;
  phaseId: string;
  phaseContractVersion: string;
  sessionVersion: number;
  activeBriefId?: string;
  activeBriefVersion?: number;
  currentUserInstruction?: string;
  currentSourceInputId?: string;
  activeRequirements: CdfContextRequirementRef[];
  constraints: CdfContextRequirementRef[];
  exclusions: CdfContextRequirementRef[];
  references: CdfContextRequirementRef[];
  approvedDecisions: CdfContextDecisionRef[];
  selections: CdfContextSelectionRef[];
  /** Unselected candidates are NEVER listed here as authoritative. */
  upstreamInputs: CdfUpstreamReference[];
  upstreamOutputs: CdfUpstreamReference[];
  refinement?: CdfContextRefinement;
  serviceContext: {
    serviceId: string;
    displayName?: string;
  };
  phaseContext: CdfPhaseContractSlice;
  provenance: CdfContextProvenance;
  warnings: CdfContextWarning[];
  unresolvedConflicts: Array<{
    conflictId: string;
    key: string;
    requirementIds: string[];
    reason: string;
    blocksGeneration: boolean;
  }>;
  createdAt: string;
};

export type ResolveGenerationContextInput = {
  sessionId: string;
  serviceId?: string;
  phaseId?: string;
  currentUserInstruction?: string;
  sourceInputId?: string;
  expectedSessionVersion?: number;
  refinePrompt?: string;
  refineScope?: string;
};

export type ResolveGenerationContextResult =
  | { ok: true; context: ResolvedGenerationContext }
  | {
      ok: false;
      status: CdfContextResolutionStatus;
      code: string;
      message: string;
      warnings?: CdfContextWarning[];
    };

/** Compact snapshot for execution metadata / provenance. */
export type ResolvedGenerationContextSnapshot = {
  contextId: string;
  contextHash: string;
  status: CdfContextResolutionStatus;
  contextSource: CdfContextSource;
  sessionId: string;
  serviceId: string;
  phaseId: string;
  sessionVersion: number;
  activeBriefId?: string;
  activeBriefVersion?: number;
  requirementKeys: string[];
  selectionPhaseIds: string[];
  decisionPhaseIds: string[];
  upstreamPhaseIds: string[];
  unresolvedConflictKeys: string[];
};
