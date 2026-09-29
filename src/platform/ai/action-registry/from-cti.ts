/**
 * Phase 14 — CTI ConversationalAction → ActionDefinition views.
 * Does not replace CTI. Does not execute CTI resolution.
 */

import type { ConversationalAction } from "../../collaboration/conversational-task-intelligence/conversational-task-contract";
import type { ActionDefinition } from "./types";

const CTI_ACTIONS: readonly ConversationalAction[] = [
  "CONVERSATIONAL_RESPONSE",
  "CREATE",
  "MODIFY",
  "REGENERATE",
  "VARIATE",
  "EXTEND",
  "CONTINUE",
  "TRANSFORM",
  "REMOVE",
  "REPLACE",
  "REVERT",
  "COMPARE",
  "EXPLAIN",
  "CRITIQUE",
  "SUMMARIZE",
  "CLARIFY",
  "APPROVE",
  "REJECT",
  "PLAN",
  "INFORMATION_REQUEST",
  "EXTRACT_ASSETS",
];

const GENERATIVE = new Set<ConversationalAction>([
  "CREATE",
  "MODIFY",
  "REGENERATE",
  "VARIATE",
  "EXTEND",
  "CONTINUE",
  "TRANSFORM",
  "REMOVE",
  "REPLACE",
]);

const READISH = new Set<ConversationalAction>([
  "COMPARE",
  "EXPLAIN",
  "CRITIQUE",
  "SUMMARIZE",
  "CLARIFY",
  "INFORMATION_REQUEST",
  "CONVERSATIONAL_RESPONSE",
  "PLAN",
]);

export function buildCtiActionDefinitions(): ActionDefinition[] {
  return CTI_ACTIONS.map((action) => {
    const generative = GENERATIVE.has(action);
    const readish = READISH.has(action);
    const required: ActionDefinition["requiredContext"] = [
      "current_instruction",
    ];
    const optional: ActionDefinition["optionalContext"] = [
      "working_memory",
      "resolved_reference",
      "multimodal_context",
      "cdf_session",
      "upstream_artifact",
      "requirements",
    ];
    if (generative) {
      optional.push("output_contract", "cdf_phase");
    }

    return {
      actionId: `cti.action.${action}`,
      version: "1.0.0",
      displayName: `CTI ${action}`,
      description:
        "Conversational task intelligence action ID (advisory). CTI identifies intent; execution remains outside Phase 14.",
      domain: "cti",
      actionType: generative
        ? "generation"
        : action === "APPROVE" || action === "REJECT"
          ? "approval"
          : "conversation_operation",
      executionMode: "CONVERSATIONAL_RESOLUTION",
      inputContract: { required, optional },
      outputContract: { kind: "conversational_action_resolution" },
      requiredContext: required,
      optionalContext: optional,
      authorizationRequirements: [
        "organization",
        "conversation_membership",
      ],
      sideEffectLevel: readish ? "READ_ONLY" : "MUTATING",
      deterministic: false,
      supportsDryRun: true,
      sourceRegistry: "cti_conversational_actions",
      sourceReference: `ConversationalAction.${action}`,
      enabled: true,
      metadata: {
        conversationalAction: action,
        replacesCti: false,
        identifiesOnly: true,
      },
    };
  });
}
