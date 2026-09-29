/**
 * Phase 14 — Artifact / render operations as ActionDefinition views.
 * References existing repository ops; does not implement lookup or persistence.
 */

import type { ActionDefinition } from "./types";

const ARTIFACT_OPS: Array<{
  id: string;
  displayName: string;
  description: string;
  actionType: ActionDefinition["actionType"];
  executionMode: ActionDefinition["executionMode"];
  outputKind: ActionDefinition["outputContract"]["kind"];
  sideEffect: ActionDefinition["sideEffectLevel"];
  required: ActionDefinition["requiredContext"];
  sourceReference: string;
  sourceRegistry: ActionDefinition["sourceRegistry"];
}> = [
  {
    id: "artifact.create",
    displayName: "Create Artifact",
    description: "createArtifact / createArtifactFromCandidate",
    actionType: "artifact_operation",
    executionMode: "ARTIFACT_OPERATION",
    outputKind: "artifact_version",
    sideEffect: "MUTATING",
    required: ["cdf_session", "configuration"],
    sourceReference: "cdf/artifacts/repository.createArtifact",
    sourceRegistry: "cdf_artifact_operations",
  },
  {
    id: "artifact.createVersion",
    displayName: "Create Artifact Version",
    description: "createVersion — exact prior version required",
    actionType: "artifact_operation",
    executionMode: "ARTIFACT_OPERATION",
    outputKind: "artifact_version",
    sideEffect: "MUTATING",
    required: ["upstream_artifact", "cdf_session"],
    sourceReference: "cdf/artifacts/repository.createVersion",
    sourceRegistry: "cdf_artifact_operations",
  },
  {
    id: "artifact.select",
    displayName: "Select Artifact Version",
    description: "markSelected / applyArtifactEngineOnSelect",
    actionType: "selection",
    executionMode: "ARTIFACT_OPERATION",
    outputKind: "selection",
    sideEffect: "MUTATING",
    required: ["upstream_artifact", "cdf_session", "user_selection"],
    sourceReference: "cdf/artifacts/repository.markSelected",
    sourceRegistry: "cdf_artifact_operations",
  },
  {
    id: "artifact.approve",
    displayName: "Approve Artifact Version",
    description: "markApproved / applyArtifactEngineOnApprove",
    actionType: "approval",
    executionMode: "ARTIFACT_OPERATION",
    outputKind: "approval",
    sideEffect: "MUTATING",
    required: ["upstream_artifact", "cdf_session"],
    sourceReference: "cdf/artifacts/repository.markApproved",
    sourceRegistry: "cdf_artifact_operations",
  },
  {
    id: "artifact.render",
    displayName: "Render Artifact",
    description: "renderArtifact via RendererRegistry",
    actionType: "rendering",
    executionMode: "RENDER_EXPORT",
    outputKind: "render_result",
    sideEffect: "EXTERNAL_SIDE_EFFECT",
    required: ["upstream_artifact"],
    sourceReference: "cdf/rendering/registry + renderArtifact",
    sourceRegistry: "cdf_renderer_registry",
  },
];

export function buildArtifactActionDefinitions(): ActionDefinition[] {
  return ARTIFACT_OPS.map((op) => ({
    actionId: op.id,
    version: "1.0.0",
    displayName: op.displayName,
    description: op.description,
    domain: "artifact",
    actionType: op.actionType,
    executionMode: op.executionMode,
    inputContract: {
      required: op.required,
      optional: ["cdf_phase", "configuration"],
    },
    outputContract: { kind: op.outputKind },
    requiredContext: op.required,
    optionalContext: ["cdf_phase", "configuration"],
    authorizationRequirements: [
      "organization",
      "project",
      "artifact_ownership",
      "cdf_session_ownership",
    ],
    sideEffectLevel: op.sideEffect,
    deterministic: true,
    supportsDryRun: false,
    sourceRegistry: op.sourceRegistry,
    sourceReference: op.sourceReference,
    enabled: true,
    metadata: {
      performsLookup: false,
      note: "Action Registry declares requirements only; Phase 8 resolves ArtifactVersions.",
    },
  }));
}
