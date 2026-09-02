/**
 * Priority 4.5 — Main conversational turn resolver.
 */

import { visibleUserText } from "../service-conversation-context";
import type { ConversationalTurnInput, ConversationalTurnResolution } from "./conversational-task-contract";
import { CONVERSATIONAL_TASK_PLANE_VERSION } from "./conversational-task-contract";
import {
  actionRequiresExecution,
  mapActionToLegacyIntent,
  resolveConversationalAction,
} from "./action-resolution";
import { selectRelevantMessages } from "./context-resolution";
import { logConversationalTurnResolution } from "./conversational-observability";
import {
  isAmbiguousReference,
  resolveReferences,
} from "./reference-resolution";
import {
  activeRequirements,
  applyRequirementOperations,
  buildEffectiveInstruction,
  parseRequirementOperations,
} from "./requirement-lifecycle";
import { extractSemanticSignals } from "./semantic-signals";
import {
  ensureTaskIntelligenceState,
  resolveActiveThread,
  updateTaskStateThread,
} from "./task-thread-manager";
import { resolveExecutionSpecification } from "./execution-spec-resolver";
import { logExecutionSpecResolution } from "./execution-spec-observability";

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function resolveConversationalTurn(
  input: ConversationalTurnInput,
): ConversationalTurnResolution {
  const nowIso = input.nowIso?.() ?? new Date().toISOString();
  const visibleMessage = visibleUserText(input.latestUserMessage);
  const signals = extractSemanticSignals(visibleMessage);
  const taskState = ensureTaskIntelligenceState(input.state.taskIntelligence);

  const { thread: initialThread, taskState: withThread } = resolveActiveThread({
    taskState,
    conversationState: input.state,
    signals,
    artifactTypeHint: signals.mentionsArtifactType,
    nowIso,
  });

  const relevantMessages = selectRelevantMessages({
    messages: input.messages,
    thread: initialThread,
    latestUserMessage: visibleMessage,
  });

  const reference = resolveReferences({
    message: visibleMessage,
    signals,
    messages: input.messages,
    thread: initialThread,
    taskState: withThread,
  });

  const hasActiveDeliverable = Boolean(
    initialThread.activeExecutionId ||
      initialThread.activeArtifactId ||
      input.state.activeExecutionId ||
      reference?.executionId,
  );

  const action = resolveConversationalAction({
    signals,
    thread: initialThread,
    hasActiveDeliverable,
    hasPendingProposal: Boolean(withThread.pendingProposal),
    hasAlternatives: initialThread.alternatives.length > 0,
    reference,
    messageLength: visibleMessage.length,
    message: visibleMessage,
  });

  const persistence = signals.persistentScope
    ? "PERSISTENT"
    : signals.temporaryScope
      ? "TEMPORARY"
      : "PERSISTENT";

  const requirementOps = parseRequirementOperations({ message: visibleMessage, signals });
  const updatedRequirements = applyRequirementOperations({
    operations: requirementOps,
    existing: initialThread.requirements,
    source: "EXPLICIT_USER",
    persistence,
    messageId: input.messageId,
    nowIso,
  });

  const effectiveReqs = activeRequirements(updatedRequirements);
  const objective =
    effectiveReqs.find((r) => r.key === "objective")?.value ?? initialThread.objective;

  let thread = Object.freeze({
    ...initialThread,
    objective,
    requirements: updatedRequirements,
    updatedAt: nowIso,
  });

  const rationale: string[] = [];
  rationale.push(`Resolved action: ${action}`);
  if (reference) {
    rationale.push(
      `Reference: ${reference.kind} (confidence ${reference.confidence.toFixed(2)})`,
    );
  }
  if (requirementOps.length > 0) {
    rationale.push(`Requirement operations: ${requirementOps.map((o) => o.kind).join(", ")}`);
  }

  let clarification: ConversationalTurnResolution["clarification"];
  const ambiguousRef = isAmbiguousReference(reference);
  const vagueModification =
    action === "MODIFY" &&
    signals.hasDeicticReference &&
    !hasActiveDeliverable &&
    !reference?.executionId;

  if (ambiguousRef) {
    clarification = Object.freeze({
      question:
        "Which deliverable or version should I apply that to? Please specify the artifact, route, or version.",
      ambiguities: Object.freeze(reference?.evidence ?? ["ambiguous_reference"]),
      preserveState: true,
    });
    rationale.push("Clarification required: ambiguous reference");
  } else if (vagueModification) {
    clarification = Object.freeze({
      question:
        "What should I change? I don't have a clear active deliverable to modify yet.",
      ambiguities: Object.freeze(["no_active_deliverable"]),
      preserveState: true,
    });
    rationale.push("Clarification required: no active deliverable");
  } else if (
    action === "CLARIFY" ||
    (visibleMessage.length < 3 && !hasActiveDeliverable)
  ) {
    clarification = Object.freeze({
      question: "Could you share a bit more detail about what you'd like me to do?",
      ambiguities: Object.freeze(["underspecified_turn"]),
      preserveState: true,
    });
  }

  const effectiveInstruction = buildEffectiveInstruction({
    objective,
    requirements: effectiveReqs,
    latestUserMessage: visibleMessage,
  });

  const executionSpec = resolveExecutionSpecification({
    message: visibleMessage,
    signals,
    action,
    requirements: effectiveReqs,
    objective,
    service: input.state.service,
    subtype: input.state.subtype,
    platform: input.state.platform,
    format: input.state.format,
    priorSpec: initialThread.lastExecutionSpec,
    referencedArtifactId: reference?.artifactId,
    referencedAssetId: reference?.targetAssetIds?.[0],
  });

  logExecutionSpecResolution({
    conversationId: input.conversationId,
    channelId: input.channelId,
    threadId: thread.threadId,
    spec: executionSpec,
  });

  if (
    executionSpec.resolutionState === "CLARIFICATION_REQUIRED" &&
    executionSpec.clarificationQuestion &&
    !clarification
  ) {
    clarification = Object.freeze({
      question: executionSpec.clarificationQuestion,
      ambiguities: Object.freeze(["ambiguous_requirement"]),
      preserveState: true,
    });
    rationale.push("Clarification required: ambiguous requirement (P4.6)");
  }

  const requiresExecution =
    clarification === undefined &&
    actionRequiresExecution(action) &&
    executionSpec.resolutionState !== "UNSUPPORTED_DELIVERABLE" &&
    !(
      action === "EXTRACT_ASSETS" &&
      (reference?.targetAssets?.length ?? 0) > 0
    );

  const resolvedInstruction =
    executionSpec.executionInstruction.trim() || effectiveInstruction;

  thread = Object.freeze({
    ...thread,
    lastExecutionSpec: executionSpec,
  });

  const intentConfidence = clampConfidence(
    0.55 +
      (reference ? reference.confidence * 0.2 : 0) +
      (hasActiveDeliverable ? 0.15 : 0) +
      (clarification ? -0.35 : 0.2),
  );
  const referenceConfidence = clampConfidence(reference?.confidence ?? (hasActiveDeliverable ? 0.6 : 0.3));
  const requirementConfidence = clampConfidence(
    effectiveReqs.length > 0 ? 0.75 : visibleMessage.length > 20 ? 0.55 : 0.4,
  );

  const legacyIntent = mapActionToLegacyIntent(action, signals);

  const observability = Object.freeze({
    conversationId: input.conversationId,
    channelId: input.channelId,
    messageId: input.messageId,
    threadId: thread.threadId,
    resolvedAction: action,
    legacyIntent,
    requiresExecution,
    clarificationRequested: Boolean(clarification),
    referencedExecutionId: reference?.executionId,
    referencedArtifactId: reference?.artifactId,
    referencedRouteId: reference?.routeId,
    targetType: reference?.kind,
    targetCount:
      reference?.targetAssets?.length ??
      (reference?.targetAssetIds?.length ?? undefined),
    resolutionConfidence: reference?.confidence,
    requirementChangeCount: requirementOps.length,
    contextMessageCount: relevantMessages.length,
  });

  logConversationalTurnResolution(observability);

  const updatedTaskState = updateTaskStateThread(withThread, thread);

  return Object.freeze({
    planeVersion: CONVERSATIONAL_TASK_PLANE_VERSION,
    action,
    legacyIntent,
    requiresExecution,
    clarification,
    reference,
    activeThreadId: thread.threadId,
    effectiveObjective: objective,
    effectiveRequirements: effectiveReqs,
    effectiveInstruction: resolvedInstruction,
    executionSpec,
    confidence: Object.freeze({
      intent: intentConfidence,
      reference: referenceConfidence,
      requirement: requirementConfidence,
    }),
    rationale: Object.freeze(rationale),
    observability,
    updatedTaskState,
  });
}
