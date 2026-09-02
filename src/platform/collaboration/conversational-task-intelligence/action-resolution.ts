/**
 * Priority 4.5 / 4.7 — Contextual action resolution (semantic scoring, not phrase commands).
 */

import type { ConversationalAction } from "./conversational-task-contract";
import type { SemanticSignals } from "./semantic-signals";
import type { ConversationalTaskThread } from "./conversational-task-contract";
import type { ResolvedReference } from "./conversational-task-contract";

export type ActionResolutionContext = {
  readonly signals: SemanticSignals;
  readonly thread: ConversationalTaskThread;
  readonly hasActiveDeliverable: boolean;
  readonly hasPendingProposal: boolean;
  readonly hasAlternatives: boolean;
  readonly reference?: ResolvedReference;
  readonly messageLength: number;
  readonly message: string;
};

type ScoredAction = { readonly action: ConversationalAction; readonly score: number };

function hasConfidentExistingReference(ctx: ActionResolutionContext): boolean {
  return Boolean(
    ctx.reference?.executionId && ctx.reference.confidence >= 0.5,
  );
}

function scoreAction(ctx: ActionResolutionContext): ScoredAction {
  const s = ctx.signals;
  const candidates: ScoredAction[] = [];
  const existingRef = hasConfidentExistingReference(ctx);

  const push = (action: ConversationalAction, score: number) => {
    candidates.push({ action, score });
  };

  if (s.isComparison) push("COMPARE", 99);
  if (s.isExplanation && !s.isCreation) push("EXPLAIN", 99);
  if (s.isSummarization) push("SUMMARIZE", 99);
  if (s.isReplacement) push("REPLACE", 88);

  if (existingRef) {
    if (s.isVariation) push("VARIATE", 98);
    if (
      s.isAssetExtraction ||
      (s.isDeliveryRequest && (ctx.reference?.targetAssets?.length ?? 0) > 1)
    ) {
      push("EXTRACT_ASSETS", 96);
    }
    if (s.isExport || s.isDeliveryRequest) {
      push("EXTRACT_ASSETS", s.isAssetExtraction ? 94 : 90);
    }
    if (/\b(regenerate|redo|retry|try again)\b/i.test(ctx.message)) {
      push("REGENERATE", 88);
    }
    if (s.isVariation) push("VARIATE", 90);
    if (s.isModification) push("MODIFY", 86);
    if (s.isImperative && !s.isCreation) push("MODIFY", 80);
    if (s.isSelection) push("MODIFY", 78);
    if (s.isCreation) push("CREATE", 15);
  }

  if (s.isReset) push("CREATE", 100);
  if (
    s.isCreation &&
    /\b(create a new|make a new|brand new|from scratch)\b/i.test(ctx.message)
  ) {
    push("CREATE", 97);
  }
  if (s.isExplanation && !s.isCreation) {
    push("EXPLAIN", 90);
  } else if (s.isExplanation && s.isCreation) {
    push("CREATE", 92);
  } else if (s.isQuestion && /\bwhy\b/i.test(ctx.thread.objective ?? "")) {
    push("EXPLAIN", 90);
  }
  if (s.isSummarization) push("SUMMARIZE", 90);
  if (s.isComparison) push("COMPARE", 88);
  if (s.isQuestion && !s.isImperative) push("INFORMATION_REQUEST", 85);
  if (s.isApproval && ctx.hasPendingProposal) push("APPROVE", 95);
  if (s.isApproval && !ctx.hasPendingProposal && ctx.hasActiveDeliverable) {
    push("MODIFY", 40);
  }
  if (s.isRejection) push("REJECT", 88);
  if (s.isFeedback && !s.isImperative && !s.isVariation) push("REJECT", 75);
  if (s.isReversion) push("REVERT", 85);
  if (s.isRemoval) push("REMOVE", 82);
  if (s.isTransformation && ctx.hasActiveDeliverable) push("TRANSFORM", 86);
  if (s.isTaskSwitch) push("MODIFY", 30);
  if (s.isSelection && ctx.hasAlternatives) push("MODIFY", 80);
  if (s.isVariation && ctx.hasActiveDeliverable) push("VARIATE", 88);
  if (s.isVariation && !ctx.hasActiveDeliverable) push("CREATE", 70);
  if (s.isContinuation && ctx.hasActiveDeliverable) push("CONTINUE", 82);
  if (s.isContinuation && !ctx.hasActiveDeliverable) push("CREATE", 60);
  if (
    s.isVariation === false &&
    s.isModification &&
    ctx.hasActiveDeliverable
  ) {
    push("MODIFY", 78);
  }
  if (s.isImperative && /\b(regenerate|redo|retry|try again)\b/i.test(ctx.message)) {
    push("REGENERATE", 70);
  }
  if (
    (s.isVariation || /\b(regenerate|redo|retry|try again|generate again)\b/i.test(ctx.message)) &&
    ctx.hasActiveDeliverable
  ) {
    push("REGENERATE", s.isVariation ? 72 : 94);
  }
  if (s.isCreation && !ctx.hasActiveDeliverable && !existingRef) push("CREATE", 80);
  if (s.isCreation && ctx.hasActiveDeliverable && s.isTransformation) {
    push("TRANSFORM", 85);
  }
  if (s.isExport && ctx.hasActiveDeliverable) push("MODIFY", 92);
  if (ctx.messageLength < 3) push("CLARIFY", 70);

  if (candidates.length === 0) {
    if (existingRef) {
      push("MODIFY", 70);
    } else if (ctx.hasActiveDeliverable && ctx.messageLength < 120) {
      push("MODIFY", 55);
    } else if (!ctx.hasActiveDeliverable) {
      push("CREATE", 50);
    } else {
      push("CONVERSATIONAL_RESPONSE", 45);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!;
}

export function resolveConversationalAction(
  ctx: ActionResolutionContext,
): ConversationalAction {
  const scored = scoreAction(ctx);
  let action = scored.action;
  const existingRef = hasConfidentExistingReference(ctx);

  if (existingRef && action === "CREATE") {
    if (/\b(create a new|make a new|brand new|from scratch)\b/i.test(ctx.message)) {
      return "CREATE";
    }
    if (ctx.signals.isAssetExtraction || ctx.signals.isDeliveryRequest) {
      action = "EXTRACT_ASSETS";
    } else if (ctx.signals.isVariation) {
      action = "VARIATE";
    } else if (/\b(regenerate|redo|retry|try again)\b/i.test(ctx.message)) {
      action = "REGENERATE";
    } else {
      action = "MODIFY";
    }
  }

  if (action === "INFORMATION_REQUEST" || action === "EXPLAIN" || action === "CRITIQUE") {
    return action;
  }
  if (action === "COMPARE" || action === "SUMMARIZE") {
    return action;
  }
  if (action === "REJECT" && !ctx.signals.isImperative && !ctx.signals.isVariation) {
    return "REJECT";
  }
  if (
    action === "MODIFY" &&
    ctx.signals.isVariation &&
    ctx.hasActiveDeliverable
  ) {
    return "VARIATE";
  }
  if (
    (action === "MODIFY" || action === "CREATE" || action === "REJECT") &&
    /\b(regenerate|redo|retry|try again|generate again)\b/i.test(ctx.message) &&
    ctx.hasActiveDeliverable
  ) {
    return "REGENERATE";
  }
  if (
    existingRef &&
    ctx.signals.isAssetExtraction &&
    action !== "EXTRACT_ASSETS"
  ) {
    return "EXTRACT_ASSETS";
  }

  return action;
}

export function actionRequiresExecution(action: ConversationalAction): boolean {
  switch (action) {
    case "CONVERSATIONAL_RESPONSE":
    case "EXPLAIN":
    case "CRITIQUE":
    case "SUMMARIZE":
    case "COMPARE":
    case "INFORMATION_REQUEST":
    case "CLARIFY":
    case "REJECT":
    case "PLAN":
    case "EXTRACT_ASSETS":
      return false;
    case "APPROVE":
      return true;
    default:
      return true;
  }
}

export function mapActionToLegacyIntent(
  action: ConversationalAction,
  signals?: SemanticSignals,
): import("../service-conversation-types").ServiceFollowUpIntent {
  if (signals?.isExport) return "export";
  switch (action) {
    case "CREATE":
    case "TRANSFORM":
      return "new_generation";
    case "EXTRACT_ASSETS":
    case "REGENERATE":
    case "VARIATE":
      return "refinement";
    case "MODIFY":
    case "REMOVE":
    case "REPLACE":
    case "REVERT":
      return "modification";
    case "EXTEND":
    case "CONTINUE":
      return "continuation";
    case "APPROVE":
      return "refinement";
    case "CLARIFY":
    case "CONVERSATIONAL_RESPONSE":
    case "EXPLAIN":
    case "CRITIQUE":
    case "SUMMARIZE":
    case "COMPARE":
    case "INFORMATION_REQUEST":
    case "REJECT":
    case "PLAN":
      return "clarification";
    default:
      return "clarification";
  }
}
