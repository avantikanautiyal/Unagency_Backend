/**
 * Priority 4.7 — Real conversational context, reference resolution & existing artifact ops.
 */

import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import {
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  resolveConversationalTurn,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

function userMsg(
  text: string,
  overrides: Partial<ServiceAiMessageRecord> = {},
): ServiceAiMessageRecord {
  const dedupeKey = overrides.dedupeKey ?? `user-${text}`;
  return {
    id: overrides.id ?? `u-${dedupeKey}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "user",
    text,
    createdAt: overrides.createdAt ?? "2026-06-01T10:00:00.000Z",
    clientMessageId: dedupeKey,
    dedupeKey,
    ...overrides,
  };
}

function logoRoutesMessage(
  executionId: string,
  overrides: Partial<ServiceAiMessageRecord> = {},
): ServiceAiMessageRecord {
  return {
    id: overrides.id ?? `ai-${executionId}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "assistant",
    text: "Here are your logo routes",
    createdAt: overrides.createdAt ?? "2026-06-01T10:01:00.000Z",
    clientMessageId: `routes-${executionId}`,
    dedupeKey: `routes-${executionId}`,
    executionId,
    artifactId: overrides.artifactId ?? `art_${executionId}`,
    routes: overrides.routes ?? [
      {
        id: "r1",
        label: "Route 1",
        title: "Bold",
        assets: [
          { id: "logo_a", label: "Logo A", imageUri: "asset://logo_a" },
          { id: "logo_b", label: "Logo B", imageUri: "asset://logo_b" },
          { id: "logo_c", label: "Logo C", imageUri: "asset://logo_c" },
        ],
      },
      { id: "r2", label: "Route 2", title: "Premium" },
      { id: "r3", label: "Route 3", title: "Minimal" },
    ],
    ...overrides,
  };
}

function logoState(
  overrides: Partial<ServiceAiConversationState> = {},
): ServiceAiConversationState {
  return {
    service: "branding",
    subtype: "logos",
    brandId: "brand1",
    productPath: "branding/logos",
    activeExecutionId: "exec_logos_v1",
    activeArtifactId: "art_logos_v1",
    ...overrides,
  };
}

function resolveTurn(
  latestUserMessage: string,
  input: {
    messages?: ServiceAiMessageRecord[];
    state?: ServiceAiConversationState;
  } = {},
) {
  const messages =
    input.messages ??
    [
      userMsg("Create 3 logo routes."),
      logoRoutesMessage("exec_logos_v1"),
    ];
  let state = input.state ?? logoState();
  const first = resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage: messages[0]!.text,
    messages: [],
    state: logoState({ activeExecutionId: undefined, activeArtifactId: undefined }),
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
  state = { ...state, taskIntelligence: first.updatedTaskState };

  return resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage,
    messages,
    state,
    nowIso: () => "2026-06-15T00:00:01.000Z",
  });
}

describe("Priority 4.7 — Conversational context & existing artifact operations", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("A — Give me route 1 is NOT CREATE", () => {
    const turn = resolveTurn("Give me route 1.");
    expect(turn.action).not.toBe("CREATE");
    expect(turn.reference?.routeId).toBe("r1");
    expect(turn.reference?.executionId).toBe("exec_logos_v1");
  });

  it("B — extract logos from route 1 individually is EXTRACT_ASSETS", () => {
    const turn = resolveTurn(
      "From route 1, give me each logo individually so I can download it.",
    );
    expect(turn.action).toBe("EXTRACT_ASSETS");
    expect(turn.action).not.toBe("CREATE");
    expect(turn.reference?.routeId).toBe("r1");
    expect(turn.reference?.targetAssetIds).toEqual(["logo_a", "logo_b", "logo_c"]);
    expect(turn.requiresExecution).toBe(false);
  });

  it("mandatory regression — route1 above individual downloadable logos", () => {
    const turn = resolveTurn(
      "Now from the generated route1 above, give me each logo individually so I can download it.",
    );
    expect(turn.action).toBe("EXTRACT_ASSETS");
    expect(turn.action).not.toBe("CREATE");
    expect(turn.reference?.routeId).toBe("r1");
    expect(turn.reference?.executionId).toBe("exec_logos_v1");
    expect(turn.reference?.targetAssetIds).toEqual(["logo_a", "logo_b", "logo_c"]);
    expect(turn.requiresExecution).toBe(false);

    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [
        userMsg("Create 3 logo routes."),
        logoRoutesMessage("exec_logos_v1"),
      ],
      state: logoState(),
      latestUserMessage:
        "Now from the generated route1 above, give me each logo individually so I can download it.",
    });
    expect(ctx.conversationalAction).toBe("EXTRACT_ASSETS");
    expect(ctx.intent).not.toBe("new_generation");
    expect(ctx.refineFromExecutionId).toBe("exec_logos_v1");
    expect(ctx.referencedRouteId).toBe("r1");
    expect(ctx.referencedTargetAssetIds).toEqual(["logo_a", "logo_b", "logo_c"]);
  });

  it("C — modify second logo from route 1 is MODIFY", () => {
    const turn = resolveTurn(
      "Take the second logo from route 1 and make it monochrome.",
    );
    expect(turn.action).toBe("MODIFY");
    expect(turn.action).not.toBe("CREATE");
    expect(turn.reference?.routeId).toBe("r1");
    expect(turn.reference?.targetAssetIndex).toBe(2);
    expect(turn.reference?.targetAssetIds).toEqual(["logo_b"]);
  });

  it("D — regenerate first logo is REGENERATE", () => {
    const turn = resolveTurn("Regenerate the first logo.");
    expect(turn.action).toBe("REGENERATE");
    expect(turn.reference?.targetAssetIndex).toBe(1);
  });

  it("E — variations of selected logo is VARIATE", () => {
    const turn = resolveTurn("Give me 3 variations of the selected logo.", {
      state: logoState({ selectedRouteId: "r1" }),
    });
    expect(turn.action).toBe("VARIATE");
    expect(turn.action).not.toBe("CREATE");
  });

  it("F — download selected logo as SVG is existing operation not CREATE", () => {
    const turn = resolveTurn("Download the selected logo as SVG.", {
      state: logoState({ selectedRouteId: "r1" }),
    });
    expect(turn.action).not.toBe("CREATE");
    expect(["EXTRACT_ASSETS", "MODIFY"]).toContain(turn.action);
  });

  it("ambiguous reference triggers clarification not CREATE", () => {
    const turn = resolveTurn("Make that one more minimal.", {
      messages: [
        userMsg("Create logos."),
        logoRoutesMessage("exec_a"),
        logoRoutesMessage("exec_b", { createdAt: "2026-06-01T10:02:00.000Z" }),
      ],
    });
    expect(turn.clarification).toBeDefined();
    expect(turn.action).not.toBe("CREATE");
  });

  it("context survival — persisted reload resolves route 1", () => {
    const t1 = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Create 3 logo routes.",
      messages: [],
      state: logoState({ activeExecutionId: undefined, activeArtifactId: undefined }),
      nowIso: () => "2026-06-15T00:00:00.000Z",
    });
    const persistedState: ServiceAiConversationState = {
      ...logoState(),
      taskIntelligence: t1.updatedTaskState,
    };
    const messages = [
      userMsg("Create 3 logo routes."),
      logoRoutesMessage("exec_logos_v1"),
    ];
    const t2 = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Take route 1 and give me the logos individually.",
      messages,
      state: persistedState,
      nowIso: () => "2026-06-15T00:00:02.000Z",
    });
    expect(t2.action).toBe("EXTRACT_ASSETS");
    expect(t2.reference?.routeId).toBe("r1");
    expect(t2.updatedTaskState.activeThreadId).toBe(
      persistedState.taskIntelligence?.activeThreadId,
    );
  });

  it("production-equivalent path — buildExecutionContext after messages persisted", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [
        userMsg("Create 3 logo routes."),
        logoRoutesMessage("exec_logos_v1"),
      ],
      state: logoState(),
      latestUserMessage: "Give me route 1.",
    });
    expect(ctx.conversationalAction).not.toBe("CREATE");
    expect(ctx.referencedRouteId).toBe("r1");
    expect(ctx.referencedExecutionId).toBe("exec_logos_v1");
  });

  it("explicit new creation remains CREATE", () => {
    const turn = resolveTurn("Create a new logo for our startup.", {
      messages: [
        userMsg("Create 3 logo routes."),
        logoRoutesMessage("exec_logos_v1"),
      ],
    });
    expect(turn.action).toBe("CREATE");
  });
});
