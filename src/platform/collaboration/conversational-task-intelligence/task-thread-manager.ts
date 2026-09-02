/**
 * Priority 4.5 — Multi-task thread management within a single conversation.
 */

import type {
  ConversationalTaskIntelligenceState,
  ConversationalTaskThread,
} from "./conversational-task-contract";
import type { ServiceAiConversationState } from "../service-conversation-types";
import type { SemanticSignals } from "./semantic-signals";
import { CONVERSATIONAL_TASK_PLANE_VERSION } from "./conversational-task-contract";

let threadCounter = 0;

export function resetThreadCounterForTests(): void {
  threadCounter = 0;
}

function nextThreadId(): string {
  threadCounter += 1;
  return `thread_${threadCounter}`;
}

export function emptyTaskIntelligenceState(): ConversationalTaskIntelligenceState {
  return Object.freeze({
    planeVersion: CONVERSATIONAL_TASK_PLANE_VERSION,
    threads: Object.freeze([]),
  });
}

export function ensureTaskIntelligenceState(
  raw: unknown,
): ConversationalTaskIntelligenceState {
  if (!raw || typeof raw !== "object") return emptyTaskIntelligenceState();
  const obj = raw as ConversationalTaskIntelligenceState;
  if (obj.planeVersion !== CONVERSATIONAL_TASK_PLANE_VERSION) {
    return emptyTaskIntelligenceState();
  }
  return Object.freeze({
    planeVersion: CONVERSATIONAL_TASK_PLANE_VERSION,
    activeThreadId: obj.activeThreadId,
    threads: Object.freeze(obj.threads ?? []),
    pendingProposal: obj.pendingProposal,
    lastResolutionAt: obj.lastResolutionAt,
  });
}

function threadLabelFromState(state: ServiceAiConversationState): string | undefined {
  if (state.service && state.subtype) return `${state.service}/${state.subtype}`;
  if (state.service) return state.service;
  if (state.productPath) return state.productPath.split("/").pop();
  return undefined;
}

export function resolveActiveThread(input: {
  readonly taskState: ConversationalTaskIntelligenceState;
  readonly conversationState: ServiceAiConversationState;
  readonly signals: SemanticSignals;
  readonly artifactTypeHint?: string;
  readonly nowIso: string;
}): { readonly thread: ConversationalTaskThread; readonly taskState: ConversationalTaskIntelligenceState } {
  let taskState = input.taskState;
  const threads = [...taskState.threads];

  if (input.signals.isTaskSwitch && input.artifactTypeHint) {
    const match = threads.find(
      (t) =>
        t.label?.toLowerCase().includes(input.artifactTypeHint!) ||
        t.service?.toLowerCase().includes(input.artifactTypeHint!),
    );
    if (match) {
      const updated = Object.freeze({
        ...match,
        status: "active" as const,
        updatedAt: input.nowIso,
      });
      const nextThreads = threads.map((t) =>
        t.threadId === match.threadId
          ? updated
          : Object.freeze({ ...t, status: t.status === "active" ? ("paused" as const) : t.status }),
      );
      taskState = Object.freeze({
        ...taskState,
        activeThreadId: match.threadId,
        threads: Object.freeze(nextThreads),
      });
      return { thread: updated, taskState };
    }
  }

  const activeId = taskState.activeThreadId;
  const existing = activeId ? threads.find((t) => t.threadId === activeId) : undefined;
  if (existing) {
    const synced = syncThreadFromConversationState(existing, input.conversationState, input.nowIso);
    const idx = threads.findIndex((t) => t.threadId === synced.threadId);
    if (idx >= 0) threads[idx] = synced;
    taskState = Object.freeze({ ...taskState, threads: Object.freeze(threads) });
    return { thread: synced, taskState };
  }

  const threadId = nextThreadId();
  const label = threadLabelFromState(input.conversationState);
  const created: ConversationalTaskThread = Object.freeze({
    threadId,
    label,
    service: input.conversationState.service,
    subtype: input.conversationState.subtype,
    status: "active",
    activeExecutionId: input.conversationState.activeExecutionId,
    activeArtifactId: input.conversationState.activeArtifactId,
    selectedRouteId: input.conversationState.selectedRouteId,
    selectedRouteTitle: input.conversationState.selectedRouteTitle,
    requirements: Object.freeze([]),
    decisions: Object.freeze([]),
    alternatives: Object.freeze([]),
    unresolvedAmbiguities: Object.freeze([]),
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  });
  const nextThreads = [
    ...threads.map((t) =>
      t.status === "active" ? Object.freeze({ ...t, status: "paused" as const }) : t,
    ),
    created,
  ];
  taskState = Object.freeze({
    ...taskState,
    activeThreadId: threadId,
    threads: Object.freeze(nextThreads),
  });
  return { thread: created, taskState };
}

function syncThreadFromConversationState(
  thread: ConversationalTaskThread,
  state: ServiceAiConversationState,
  nowIso: string,
): ConversationalTaskThread {
  return Object.freeze({
    ...thread,
    service: state.service ?? thread.service,
    subtype: state.subtype ?? thread.subtype,
    activeExecutionId: state.activeExecutionId ?? thread.activeExecutionId,
    activeArtifactId: state.activeArtifactId ?? thread.activeArtifactId,
    selectedRouteId: state.selectedRouteId ?? thread.selectedRouteId,
    selectedRouteTitle: state.selectedRouteTitle ?? thread.selectedRouteTitle,
    updatedAt: nowIso,
  });
}

export function applyExecutionOutcomeToThread(input: {
  readonly thread: ConversationalTaskThread;
  readonly executionId: string;
  readonly artifactId?: string;
  readonly routeId?: string;
  readonly routeTitle?: string;
  readonly failed?: boolean;
  readonly nowIso: string;
}): ConversationalTaskThread {
  const alternatives = [...input.thread.alternatives];
  if (!alternatives.some((a) => a.executionId === input.executionId)) {
    alternatives.push(
      Object.freeze({
        executionId: input.executionId,
        artifactId: input.artifactId,
        routeId: input.routeId,
        label: input.routeTitle,
        createdAt: input.nowIso,
      }),
    );
  }
  return Object.freeze({
    ...input.thread,
    activeExecutionId: input.failed ? input.thread.activeExecutionId : input.executionId,
    activeArtifactId: input.failed ? input.thread.activeArtifactId : input.artifactId,
    selectedRouteId: input.routeId ?? input.thread.selectedRouteId,
    selectedRouteTitle: input.routeTitle ?? input.thread.selectedRouteTitle,
    parentExecutionId: input.thread.activeExecutionId,
    alternatives: Object.freeze(alternatives),
    status: input.failed ? input.thread.status : "active",
    updatedAt: input.nowIso,
  });
}

export function updateTaskStateThread(
  taskState: ConversationalTaskIntelligenceState,
  thread: ConversationalTaskThread,
): ConversationalTaskIntelligenceState {
  const threads = taskState.threads.map((t) =>
    t.threadId === thread.threadId ? thread : t,
  );
  return Object.freeze({
    ...taskState,
    activeThreadId: thread.threadId,
    threads: Object.freeze(threads),
    lastResolutionAt: thread.updatedAt,
  });
}
