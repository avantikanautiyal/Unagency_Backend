/**
 * Priority 4.5 — Main conversational turn resolver.
 */

import { visibleUserText } from "../service-conversation-context";
import type {
  ConversationalTaskThread,
  ConversationalTurnInput,
  ConversationalTurnResolution,
} from "./conversational-task-contract";
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
import { extractSemanticSignals, isSubstantiveNewGenerationBrief } from "./semantic-signals";
import {
  ensureTaskIntelligenceState,
  resolveActiveThread,
  updateTaskStateThread,
} from "./task-thread-manager";
import { resolveExecutionSpecification } from "./execution-spec-resolver";
import { logExecutionSpecResolution } from "./execution-spec-observability";
import {
  buildLogoSelectionClarification,
  enrichExecutionSpecWithAuthoritativeLogo,
  resolveLogoFollowUpFromMessage,
} from "./authoritative-logo-resolver";
import type { AuthoritativeLogoSpec } from "./execution-specification";

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pendingLogoFromThread(
  thread: ConversationalTaskThread,
): AuthoritativeLogoSpec | undefined {
  const pendingCandidates =
    thread.pendingLogoClarification?.candidates ??
    (thread.lastExecutionSpec?.referenceAssets?.logo?.value.mode === "NEEDS_SELECTION"
      ? thread.lastExecutionSpec.referenceAssets.logo.value.candidates
      : undefined);
  if (!pendingCandidates?.length) return undefined;
  return Object.freeze({
    mode: "NEEDS_SELECTION" as const,
    authoritative: true,
    candidates: pendingCandidates,
  });
}

export function resolveConversationalTurn(
  input: ConversationalTurnInput,
): ConversationalTurnResolution {
  const nowIso = input.nowIso?.() ?? new Date().toISOString();
  const visibleMessage = visibleUserText(input.latestUserMessage);
  // Prefer LLM-classified signals when provided; heuristic extract is fallback only.
  const signals = input.signals ?? extractSemanticSignals(visibleMessage);
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

  let action = resolveConversationalAction({
    signals,
    thread: initialThread,
    hasActiveDeliverable,
    hasPendingProposal: Boolean(withThread.pendingProposal),
    hasAlternatives: initialThread.alternatives.length > 0,
    reference,
    messageLength: visibleMessage.length,
    message: visibleMessage,
  });

  // Substantive new briefs misclassified as MODIFY (e.g. "focus on…", "make it…")
  // with no prior deliverable must still execute as CREATE.
  // Prefer LLM flag when signals were classified; English heuristic is fallback only.
  const substantiveNew = input.signals
    ? input.isSubstantiveNewGeneration === true
    : isSubstantiveNewGenerationBrief(visibleMessage);
  if (
    action === "MODIFY" &&
    !hasActiveDeliverable &&
    !reference?.executionId &&
    substantiveNew
  ) {
    action = "CREATE";
  }

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

  const effectiveInstruction = buildEffectiveInstruction({
    objective,
    requirements: effectiveReqs,
    latestUserMessage: visibleMessage,
  });

  const priorPendingLogo = pendingLogoFromThread(initialThread);
  const logoFollowUp = priorPendingLogo
    ? resolveLogoFollowUpFromMessage({
        message: visibleMessage,
        prior: priorPendingLogo,
      })
    : undefined;

  const pendingVaultLogoCandidates =
    initialThread.pendingLogoClarification?.candidates?.filter(
      (candidate) => candidate.source === "VAULT",
    ) ?? [];
  const mergedVaultLogoCandidates = Object.freeze([
    ...(input.logoDiscovery?.vaultCandidates ?? []),
    ...pendingVaultLogoCandidates.filter(
      (pending) =>
        !(input.logoDiscovery?.vaultCandidates ?? []).some(
          (candidate) => candidate.assetId === pending.assetId,
        ),
    ),
  ]);

  let executionSpec = resolveExecutionSpecification({
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
    vaultLogoCandidates: mergedVaultLogoCandidates,
    attachmentLogoAssetIds: input.logoDiscovery?.attachmentLogoAssetIds,
    vaultLogoChoice:
      input.logoDiscovery?.vaultLogoChoice ??
      (logoFollowUp?.mode === "USE_EXISTING" ? logoFollowUp.assetId : undefined),
    generateNewLogoRequested: logoFollowUp?.mode === "GENERATE_IF_ABSENT",
  });

  if (logoFollowUp?.mode === "USE_EXISTING" && logoFollowUp.assetId) {
    executionSpec = enrichExecutionSpecWithAuthoritativeLogo(executionSpec, logoFollowUp);
    rationale.push(`Logo selection resolved: ${logoFollowUp.assetId}`);
  } else if (logoFollowUp?.mode === "GENERATE_IF_ABSENT") {
    rationale.push("Logo selection overridden: generate new logo");
  }

  logExecutionSpecResolution({
    conversationId: input.conversationId,
    channelId: input.channelId,
    threadId: thread.threadId,
    spec: executionSpec,
  });

  let clarification: ConversationalTurnResolution["clarification"];
  let logoSpec = executionSpec.referenceAssets?.logo?.value;
  const pendingResumePrompt =
    initialThread.pendingLogoClarification?.resumePrompt?.trim() ||
    visibleMessage;

  const explicitLogoChoice = input.logoDiscovery?.vaultLogoChoice?.trim();
  const pendingLogoCandidates =
    logoSpec?.mode === "NEEDS_SELECTION" && logoSpec.candidates?.length
      ? logoSpec.candidates
      : priorPendingLogo?.candidates?.length && !logoFollowUp && !explicitLogoChoice
        ? priorPendingLogo.candidates
        : undefined;

  if (pendingLogoCandidates?.length) {
    if (logoSpec?.mode !== "NEEDS_SELECTION") {
      executionSpec = enrichExecutionSpecWithAuthoritativeLogo(
        executionSpec,
        Object.freeze({
          mode: "NEEDS_SELECTION",
          authoritative: true,
          candidates: pendingLogoCandidates,
        }),
      );
      logoSpec = executionSpec.referenceAssets?.logo?.value;
    }
    clarification = buildLogoSelectionClarification({
      candidates: pendingLogoCandidates,
      resumePrompt: pendingResumePrompt,
    });
    rationale.push("Clarification required: authoritative logo selection");
  } else if (
    priorPendingLogo &&
    !logoFollowUp &&
    /\b(use|pick|choose|select)\b/i.test(visibleMessage)
  ) {
    clarification = buildLogoSelectionClarification({
      candidates: priorPendingLogo.candidates ?? [],
      resumePrompt: initialThread.pendingLogoClarification?.resumePrompt ?? pendingResumePrompt,
    });
    rationale.push("Clarification required: logo selection still ambiguous");
  } else {
    const ambiguousRef = isAmbiguousReference(reference);
    const substantiveCreateBrief = isSubstantiveNewGenerationBrief(visibleMessage);
    const vagueModification =
      action === "MODIFY" &&
      signals.hasDeicticReference &&
      !hasActiveDeliverable &&
      !reference?.executionId &&
      // Long create briefs often contain "it/this/that" and "focus on"/"work on"
      // without meaning a follow-up edit — same exemption as ambiguous-reference ASKs.
      !substantiveCreateBrief;

    if (ambiguousRef && !substantiveCreateBrief) {
      clarification = Object.freeze({
        kind: "generic",
        question:
          "Which deliverable or version should I apply that to? Please specify the artifact, route, or version.",
        ambiguities: Object.freeze(reference?.evidence ?? ["ambiguous_reference"]),
        preserveState: true,
      });
      rationale.push("Clarification required: ambiguous reference");
    } else if (vagueModification) {
      clarification = Object.freeze({
        kind: "generic",
        question:
          "What should I change? I don't have a clear active deliverable to modify yet.",
        ambiguities: Object.freeze(["no_active_deliverable"]),
        preserveState: true,
      });
    } else if (
      action === "CLARIFY" ||
      (visibleMessage.length < 3 && !hasActiveDeliverable)
    ) {
      clarification = Object.freeze({
        kind: "generic",
        question: "Could you share a bit more detail about what you'd like me to do?",
        ambiguities: Object.freeze(["underspecified_turn"]),
        preserveState: true,
      });
    } else if (
      executionSpec.resolutionState === "CLARIFICATION_REQUIRED" &&
      executionSpec.clarificationQuestion
    ) {
      clarification = Object.freeze({
        kind: "generic",
        question: executionSpec.clarificationQuestion,
        ambiguities: Object.freeze(["ambiguous_requirement"]),
        preserveState: true,
      });
      rationale.push("Clarification required: ambiguous requirement (P4.6)");
    }
  }

  const requiresExecution =
    clarification === undefined &&
    actionRequiresExecution(action) &&
    executionSpec.resolutionState !== "UNSUPPORTED_DELIVERABLE" &&
    executionSpec.referenceAssets?.logo?.value.mode !== "NEEDS_SELECTION" &&
    !(
      action === "EXTRACT_ASSETS" &&
      (reference?.targetAssets?.length ?? 0) > 0
    );

  const resolvedInstruction =
    executionSpec.executionInstruction.trim() || effectiveInstruction;

  const logoResolved =
    executionSpec.referenceAssets?.logo?.value.mode === "USE_EXISTING" ||
    executionSpec.referenceAssets?.logo?.value.mode === "GENERATE_IF_ABSENT";

  thread = Object.freeze({
    ...thread,
    lastExecutionSpec: executionSpec,
    pendingLogoClarification:
      logoSpec?.mode === "NEEDS_SELECTION" && logoSpec.candidates?.length
        ? Object.freeze({
            candidates: logoSpec.candidates,
            resumePrompt: pendingResumePrompt,
          })
        : logoResolved
          ? undefined
          : initialThread.pendingLogoClarification,
    unresolvedAmbiguities: clarification
      ? Object.freeze([
          ...new Set([
            ...initialThread.unresolvedAmbiguities,
            ...(clarification.kind === "logo_selection"
              ? ["logo_selection"]
              : clarification.ambiguities),
          ]),
        ])
      : initialThread.unresolvedAmbiguities,
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
