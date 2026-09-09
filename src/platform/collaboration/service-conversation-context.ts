/**
 * Deterministic context builder — derives execution input from conversation state.
 * Never exposes internal execution prompts as chat messages.
 */

import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
  ServiceExecutionContext,
  ServiceFollowUpIntent,
} from "./service-conversation-types";
import { resolveConversationalTurn } from "./conversational-task-intelligence";
import type { ConversationalTurnResolution } from "./conversational-task-intelligence/conversational-task-contract";

const EXPORT_PATTERNS =
  /\b(export|download|save as|get as|convert to|give me)\b.*\b(pdf|pptx|docx|html|zip|powerpoint|word|slide deck)\b/i;
const REFINEMENT_PATTERNS =
  /\b(more premium|more minimal|make it|change the|update the|refine|tweak|adjust|improve|polish|elevate|simplify|darker|lighter|bolder|softer)\b/i;
const MODIFICATION_PATTERNS =
  /\b(add|remove|delete|insert|include|exclude|swap|replace|move|reorder)\b/i;
const ROUTE_SELECT_PATTERNS =
  /\b(route|option|direction|concept|version|choice)\s*(#?\d+|one|two|three|first|second|third)\b/i;
const CONTINUATION_PATTERNS =
  /\b(continue|keep going|next|proceed|expand|build out|flesh out|develop)\b/i;

/** Internal execution scaffolding — must never become a visible chat message. */
export function isInternalExecutionPrompt(text?: string | null): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  return (
    raw.includes("[REFINE MODE") ||
    raw.includes("[Locked brief") ||
    raw.includes("[Client refinement notes") ||
    raw.includes("[Product selection") ||
    raw.includes("[User brief]") ||
    raw.includes("[Output requirements]") ||
    raw.includes("[Client brief") ||
    /^\[Prompt facts/i.test(raw)
  );
}

export function visibleUserText(text?: string | null): string {
  const raw = text?.trim() ?? "";
  if (!raw || !isInternalExecutionPrompt(raw)) return raw;
  const userBrief = raw.match(/\[User brief\]\s*([\s\S]+)$/i);
  if (userBrief?.[1]?.trim()) return userBrief[1].trim();
  const locked = raw.match(
    /\[Locked brief[^\]]*\]\s*([\s\S]*?)\s*\[Client refinement/i
  );
  if (locked?.[1]?.trim()) return locked[1].trim();
  return "";
}

/**
 * Legacy English follow-up classifier — kept for tests / offline callers only.
 * Production conversation control uses LLM `classifySemanticSignals` → CTI turn resolver.
 */
export function classifyFollowUpIntent(
  message: string,
  state: ServiceAiConversationState
): ServiceFollowUpIntent {
  const text = message.trim().toLowerCase();
  if (!text) return "clarification";
  if (EXPORT_PATTERNS.test(message)) return "export";
  if (
    state.activeExecutionId &&
    REFINEMENT_PATTERNS.test(message)
  ) {
    return "refinement";
  }
  if (state.activeExecutionId && ROUTE_SELECT_PATTERNS.test(message)) {
    return "modification";
  }
  if (
    state.activeExecutionId &&
    MODIFICATION_PATTERNS.test(message)
  ) {
    return "modification";
  }
  if (state.activeExecutionId && CONTINUATION_PATTERNS.test(message)) {
    return "continuation";
  }
  if (state.activeExecutionId && text.length < 120) {
    // Short follow-ups with an active deliverable are refinements by default.
    return "refinement";
  }
  return "new_generation";
}

function parseExportFormat(message: string): ServiceExecutionContext["exportFormat"] {
  const lower = message.toLowerCase();
  if (/\bpptx\b|powerpoint/.test(lower)) return "pptx";
  if (/\bdocx\b|\bword\b/.test(lower)) return "docx";
  if (/\bhtml\b/.test(lower)) return "html";
  if (/\bzip\b/.test(lower)) return "zip";
  if (/\bpdf\b/.test(lower)) return "pdf";
  return undefined;
}

function parseRouteReference(
  message: string,
  messages: readonly ServiceAiMessageRecord[],
): {
  routeId?: string;
  routeIndex?: number;
} {
  const match = message.match(
    /\b(?:route|option|direction|concept|version|choice)\s*(?:#?\s*)?(\d+|one|two|three|first|second|third)\b/i,
  );
  const compact = message.match(/\broute(\d+)\b/i);
  const token = match?.[1] ?? compact?.[1];
  if (!token) return {};
  const map: Record<string, number> = {
    one: 1,
    first: 1,
    two: 2,
    second: 2,
    three: 3,
    third: 3,
  };
  const index = map[token.toLowerCase()] ?? Number.parseInt(token, 10);
  if (!Number.isFinite(index) || index < 1) return {};
  const execMessages = [...messages]
    .filter((m) => m.executionId && (m.routes?.length ?? 0) > 0)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const targetMsg = execMessages[execMessages.length - 1];
  const routeId = targetMsg?.routes?.[index - 1]?.id;
  return routeId ? { routeIndex: index, routeId } : { routeIndex: index };
}

export function buildExecutionContextFromConversation(input: {
  conversationId: string;
  channelId: string;
  messages: ServiceAiMessageRecord[];
  state: ServiceAiConversationState;
  latestUserMessage: string;
  /** When provided, skips a second conversational turn resolution (P4.9.1). */
  turn?: ConversationalTurnResolution;
}): ServiceExecutionContext {
  const visibleInstruction = visibleUserText(input.latestUserMessage);
  const userMessages = input.messages
    .filter((m) => m.role === "user")
    .map((m) => visibleUserText(m.text))
    .filter(Boolean);

  const priorUserInstructions = userMessages.filter(
    (brief) => brief !== visibleInstruction
  );
  const originalUserBrief = userMessages[0];

  const turn =
    input.turn ??
    resolveConversationalTurn({
      conversationId: input.conversationId,
      channelId: input.channelId,
      latestUserMessage: input.latestUserMessage,
      messages: input.messages,
      state: input.state,
    });

  const intent: ServiceFollowUpIntent = turn.clarification
    ? "clarification"
    : turn.action === "EXTRACT_ASSETS"
      ? "modification"
      : turn.legacyIntent;
  const routeRef = parseRouteReference(visibleInstruction, input.messages);

  const executionIds = [
    ...new Set(
      input.messages
        .map((m) => m.executionId)
        .filter((id): id is string => Boolean(id?.trim()))
    ),
  ];

  const hasConfidentReference = Boolean(
    turn.reference?.executionId && turn.reference.confidence >= 0.5,
  );

  const refineFromExecutionId =
    intent === "export"
      ? undefined
      : turn.reference?.executionId ??
        (hasConfidentReference
          ? turn.reference?.executionId
          : intent === "new_generation"
            ? undefined
            : input.state.activeExecutionId);

  return {
    conversationId: input.conversationId,
    channelId: input.channelId,
    intent,
    latestUserInstruction: visibleInstruction,
    priorUserInstructions,
    originalUserBrief,
    service: input.state.service,
    subtype: input.state.subtype,
    platform: input.state.platform,
    format: input.state.format,
    category: input.state.category,
    brandId: input.state.brandId,
    productPath: input.state.productPath,
    activeExecutionId: input.state.activeExecutionId,
    activeArtifactId: input.state.activeArtifactId,
    selectedRouteId:
      turn.reference?.routeId ?? routeRef.routeId ?? input.state.selectedRouteId,
    selectedRouteTitle: input.state.selectedRouteTitle,
    refineFromExecutionId,
    exportFormat:
      intent === "export" ? parseExportFormat(visibleInstruction) : undefined,
    executionIds,
    conversationalAction: turn.action,
    requiresExecution: turn.requiresExecution,
    clarificationRequired: Boolean(turn.clarification),
    clarificationQuestion: turn.clarification?.question,
    clarification: turn.clarification,
    effectiveRequirements: turn.effectiveRequirements,
    effectiveInstruction: turn.effectiveInstruction,
    executionSpec: turn.executionSpec,
    activeThreadId: turn.activeThreadId,
    referencedExecutionId: turn.reference?.executionId,
    referencedArtifactId: turn.reference?.artifactId,
    referencedRouteId:
      turn.reference?.routeId ?? routeRef.routeId ?? input.state.selectedRouteId,
    referencedTargetAssetIds: turn.reference?.targetAssetIds,
    referencedTargetAssets: turn.reference?.targetAssets,
  };
}

/** Merge server + local messages by stable dedupeKey — idempotent hydration. */
function routeRichness(
  message: Pick<ServiceAiMessageRecord, "routes" | "executionId">
): number {
  const routes = message.routes ?? [];
  return (
    routes.length * 10 +
    routes.filter((route) => route.imageUri).length * 15 +
    (message.executionId ? 1 : 0)
  );
}

export function mergeServiceAiMessages(
  ...groups: ServiceAiMessageRecord[][]
): ServiceAiMessageRecord[] {
  const byKey = new Map<string, ServiceAiMessageRecord>();
  for (const group of groups) {
    for (const message of group) {
      const key = message.dedupeKey || message.clientMessageId || message.id;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, message);
        continue;
      }
      const prefer =
        routeRichness(message) > routeRichness(existing) ? message : existing;
      byKey.set(key, {
        ...prefer,
        id: existing.id,
        text: message.text.length > existing.text.length ? message.text : existing.text,
      });
    }
  }
  const sorted = [...byKey.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const byUserText = new Map<string, ServiceAiMessageRecord>();
  const nonUsers: ServiceAiMessageRecord[] = [];
  for (const message of sorted) {
    if (message.role !== "user") {
      nonUsers.push(message);
      continue;
    }
    const textKey = message.text.trim();
    const existing = byUserText.get(textKey);
    if (!existing) {
      byUserText.set(textKey, message);
      continue;
    }
    const prefer =
      message.executionId && !existing.executionId ? message : existing;
    byUserText.set(textKey, {
      ...prefer,
      id: existing.id,
      executionId: prefer.executionId || existing.executionId,
      dedupeKey: prefer.executionId
        ? `user-exec-${prefer.executionId}`
        : prefer.dedupeKey || existing.dedupeKey,
    });
  }

  const users = [...byUserText.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return [...users, ...nonUsers].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
