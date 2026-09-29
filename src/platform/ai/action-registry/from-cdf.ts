/**
 * Phase 14 — Build ActionDefinition views from authoritative CDF sources.
 * Does not re-define CDF phases or transition semantics.
 */

import {
  CDF_ACTION_CATALOG,
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
  toLegacyTransitionAction,
} from "../../cdf/canonical";
import {
  buildServiceDependencyContract,
  hasDeepIngestRuntime,
} from "../conversational-runtime/dependency-contracts";
import { isLlmGenerationModality } from "../conversational-runtime/acceptance-matrix";
import type { ActionDefinition } from "./types";

const TRANSITION_VERSION = "1.0.0";
const PHASE_VERSION = "1.0.0";

/** Map CDF action catalog → ActionDefinition (source: cdf_action_catalog). */
export function buildCdfTransitionActions(): ActionDefinition[] {
  return (Object.keys(CDF_ACTION_CATALOG) as Array<keyof typeof CDF_ACTION_CATALOG>).map(
    (kind) => {
      const def = CDF_ACTION_CATALOG[kind];
      const legacy = toLegacyTransitionAction(kind);
      const deterministic = kind !== "refine"; // refine may invoke generation
      const isRefine = kind === "refine";
      const isApprove = kind === "approve";
      const isSelect = kind === "select";
      const isFinal = kind === "final_action";

      let actionType: ActionDefinition["actionType"] = "state_transition";
      if (isSelect) actionType = "selection";
      else if (isApprove) actionType = "approval";
      else if (isRefine) actionType = "refinement";
      else if (isFinal) actionType = "export";

      const required: ActionDefinition["requiredContext"] = ["cdf_session"];
      if (def.requiresPrompt) required.push("current_instruction");
      if (def.requiresArtifact) required.push("upstream_artifact");
      if (def.requiresSelection) required.push("user_selection");

      return {
        actionId: `cdf.transition.${legacy}`,
        version: TRANSITION_VERSION,
        displayName: `CDF ${kind}`,
        description: `CDF state-machine transition: ${kind} (wire: ${legacy}).`,
        domain: "cdf",
        actionType,
        executionMode: isRefine
          ? "MODEL_GENERATION"
          : isFinal
            ? "RENDER_EXPORT"
            : "STATE_TRANSITION",
        inputContract: {
          required,
          optional: ["cdf_phase", "requirements", "working_memory"],
        },
        outputContract: {
          kind: isFinal
            ? "export_result"
            : isSelect
              ? "selection"
              : isApprove
                ? "approval"
                : "cdf_transition_result",
        },
        requiredContext: required,
        optionalContext: ["cdf_phase", "requirements", "working_memory"],
        authorizationRequirements: [
          "organization",
          "project",
          "cdf_session_ownership",
        ],
        sideEffectLevel: "MUTATING",
        deterministic: !isRefine,
        supportsDryRun: false,
        sourceRegistry: "cdf_action_catalog",
        sourceReference: `CDF_ACTION_CATALOG.${kind}`,
        enabled: true,
        metadata: {
          cdfActionKind: kind,
          legacyTransitionAction: legacy,
          repeatable: def.repeatable,
          idempotent: def.idempotent,
        },
      };
    },
  );
}

/**
 * Map each active CDF phase that represents generation / config / materialize
 * to an ActionDefinition view (source: cdf_canonical_phases).
 */
export function buildCdfPhaseActions(): ActionDefinition[] {
  const out: ActionDefinition[] = [];
  for (const serviceId of listCdfCanonicalServiceIds()) {
    const svc = resolveCdfCanonicalService(serviceId);
    if (!svc) continue;
    const contract = buildServiceDependencyContract(serviceId);
    const contentConsumers = new Set(
      contract.contentDependentEdges.map((e) => e.toPhaseId),
    );

    for (const phase of svc.phases) {
      if (phase.implementationStatus !== "active") continue;
      const modality = String(phase.generationModality);
      const isLlm = isLlmGenerationModality(modality);
      const isMaterialize = modality === "materialize";
      const isConfig = modality === "none";
      const needsUpstream = contentConsumers.has(phase.phaseId);
      const deep = hasDeepIngestRuntime(serviceId);

      const required: ActionDefinition["requiredContext"] = [
        "cdf_session",
        "cdf_phase",
        "cdf_context",
      ];
      const optional: ActionDefinition["optionalContext"] = [
        "working_memory",
        "multimodal_context",
        "active_brief",
        "production_spec",
        "authority",
      ];

      if (isLlm) {
        required.push("current_instruction", "output_contract");
        optional.push("requirements", "resolved_reference");
        if (needsUpstream) required.push("upstream_artifact");
        else optional.push("upstream_artifact");
      } else if (isConfig) {
        required.push("user_selection", "configuration");
      }

      let actionType: ActionDefinition["actionType"] = "deterministic_operation";
      let executionMode: ActionDefinition["executionMode"] =
        "DETERMINISTIC_EXECUTION";
      let outputKind: ActionDefinition["outputContract"]["kind"] =
        "cdf_session_state";

      if (isLlm) {
        actionType =
          phase.refinement?.enabled === true ? "refinement" : "generation";
        executionMode = "MODEL_GENERATION";
        outputKind = "generation_result";
      } else if (isMaterialize) {
        actionType = "export";
        executionMode = "RENDER_EXPORT";
        outputKind = "export_result";
      } else if (isConfig) {
        actionType = "selection";
        executionMode = "STATE_TRANSITION";
        outputKind = "selection";
      }

      const actionId = `cdf.phase.${serviceId}.${phase.phaseId}${
        isLlm ? ".generate" : isMaterialize ? ".materialize" : ".configure"
      }`;

      out.push({
        actionId,
        version: PHASE_VERSION,
        displayName: `${svc.displayName}: ${phase.name}`,
        description: phase.entryMessage ?? `${serviceId}/${phase.phaseId}`,
        domain: `cdf.${serviceId}`,
        actionType,
        executionMode,
        inputContract: { required, optional },
        outputContract: {
          kind: outputKind,
          artifactKey: phase.artifact?.artifactKey,
          notes: isLlm
            ? "Output ArtifactVersion via existing ingest when deep runtime exists"
            : undefined,
        },
        requiredContext: required,
        optionalContext: optional,
        authorizationRequirements: [
          "organization",
          "project",
          "cdf_session_ownership",
        ],
        sideEffectLevel: isMaterialize
          ? "EXTERNAL_SIDE_EFFECT"
          : isLlm
            ? "MUTATING"
            : "MUTATING",
        deterministic: !isLlm,
        supportsDryRun: false,
        sourceRegistry: "cdf_canonical_phases",
        sourceReference: `CDF_CANONICAL_SERVICES.${serviceId}.phases.${phase.phaseId}`,
        enabled: true,
        metadata: {
          serviceId,
          phaseId: phase.phaseId,
          generationModality: modality,
          artifactKey: phase.artifact?.artifactKey,
          serviceDependencyClass: contract.classification,
          artifactContinuityComplete: deep && isLlm ? true : !isLlm ? true : false,
          classDLimitation:
            contract.classification === "D" && isLlm
              ? "Content-dependent multi-stage flow lacks deep ArtifactVersion ingest; action is registered but not artifact-complete."
              : undefined,
          requiresModelRuntime: isLlm,
          // Generation must go through Context Orchestrator → CMR → Model Runtime
          contextAssembly: isLlm ? "context_orchestrator" : "none",
        },
      });
    }
  }
  return out;
}
