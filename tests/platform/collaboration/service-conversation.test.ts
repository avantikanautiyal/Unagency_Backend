/**
 * Service AI conversation — persistent context-aware service chat regression tests.
 */

import {
  buildExecutionContextFromConversation,
  classifyFollowUpIntent,
  isInternalExecutionPrompt,
  mergeServiceAiMessages,
} from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";

function userMsg(
  text: string,
  overrides: Partial<ServiceAiMessageRecord> = {}
): ServiceAiMessageRecord {
  const dedupeKey = overrides.dedupeKey ?? `user-pending-${text}`;
  return {
    id: overrides.id ?? `u-${dedupeKey}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "user",
    text,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    clientMessageId: dedupeKey,
    dedupeKey,
    ...overrides,
  };
}

function assistantRoutes(
  executionId: string,
  overrides: Partial<ServiceAiMessageRecord> = {}
): ServiceAiMessageRecord {
  return {
    id: overrides.id ?? `ai-${executionId}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "assistant",
    text: "Here are your routes",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    clientMessageId: `routes-exec-${executionId}`,
    dedupeKey: `routes-exec-${executionId}`,
    executionId,
    routes: [
      { id: "r1", label: "Route 1", title: "Bold" },
      { id: "r2", label: "Route 2", title: "Premium" },
      { id: "r3", label: "Route 3", title: "Minimal" },
    ],
    ...overrides,
  };
}

describe("Service conversation context", () => {
  const baseState: ServiceAiConversationState = {
    service: "presentations",
    subtype: "pitch-decks",
    brandId: "brand1",
    productPath: "presentations/pitch-decks",
    activeExecutionId: "exec_deck_v1",
    selectedRouteId: "r2",
    selectedRouteTitle: "Route 2",
  };

  it("1. persists conversation identity across context builds", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [userMsg("Create a pitch deck"), assistantRoutes("exec_deck_v1")],
      state: baseState,
      latestUserMessage: "Add a pricing slide",
    });
    expect(ctx.conversationId).toBe("conv1");
    expect(ctx.channelId).toBe("service_abc");
    expect(ctx.executionIds).toContain("exec_deck_v1");
  });

  it("2. multiple executions belong to the same conversation", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [
        userMsg("Create deck", { executionId: "exec_a" }),
        assistantRoutes("exec_a"),
        userMsg("Make route 2 premium", { executionId: "exec_b" }),
        assistantRoutes("exec_b"),
      ],
      state: { ...baseState, activeExecutionId: "exec_b" },
      latestUserMessage: "Export as PPTX",
    });
    expect(ctx.executionIds).toEqual(["exec_a", "exec_b"]);
    expect(ctx.conversationId).toBe("conv1");
  });

  it("3. follow-up messages include prior user instructions", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [
        userMsg("Create a pitch deck for Dusini"),
        assistantRoutes("exec_1"),
      ],
      state: baseState,
      latestUserMessage: "Make route 2 more premium",
    });
    expect(ctx.priorUserInstructions).toContain("Create a pitch deck for Dusini");
    expect(ctx.latestUserInstruction).toBe("Make route 2 more premium");
    expect(ctx.originalUserBrief).toBe("Create a pitch deck for Dusini");
  });

  it('4. "make it more premium" refines existing deliverable rather than new generation', () => {
    const intent = classifyFollowUpIntent("Make route 2 more premium", baseState);
    expect(intent).toBe("refinement");
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [userMsg("Deck brief"), assistantRoutes("exec_deck_v1")],
      state: baseState,
      latestUserMessage: "Make route 2 more premium",
    });
    expect(ctx.intent).toBe("refinement");
    expect(ctx.refineFromExecutionId).toBe("exec_deck_v1");
  });

  it("5. artifact/execution references stay linked to conversation", () => {
    const state: ServiceAiConversationState = {
      ...baseState,
      activeExecutionId: "exec_x",
      activeArtifactId: "art_pptx",
    };
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [assistantRoutes("exec_x", { artifactId: "art_pptx" })],
      state,
      latestUserMessage: "Thanks",
    });
    expect(ctx.activeExecutionId).toBe("exec_x");
    expect(ctx.activeArtifactId).toBe("art_pptx");
  });

  it("6. user messages dedupe to exactly one entry per dedupeKey", () => {
    const merged = mergeServiceAiMessages([
      userMsg("Hello", { dedupeKey: "user-pending-Hello", id: "a" }),
      userMsg("Hello", { dedupeKey: "user-pending-Hello", id: "b" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("a");
  });

  it("7. polling/hydration does not duplicate route messages", () => {
    const merged = mergeServiceAiMessages(
      [assistantRoutes("exec_1", { id: "local" })],
      [assistantRoutes("exec_1", { id: "server", routes: [
        { id: "r1", label: "Route 1", title: "Bold", imageUri: "https://x/y.png" },
        { id: "r2", label: "Route 2", title: "Premium" },
        { id: "r3", label: "Route 3", title: "Minimal" },
      ]})]
    );
    expect(merged.filter((m) => m.executionId === "exec_1")).toHaveLength(1);
    expect(merged[0]?.routes?.[0]?.imageUri).toBe("https://x/y.png");
  });

  it("8. page reload merge does not duplicate messages", () => {
    const disk = [
      userMsg("Brief", { dedupeKey: "user-exec-exec_1", executionId: "exec_1" }),
      assistantRoutes("exec_1"),
    ];
    const memory = [
      userMsg("Brief", { dedupeKey: "user-pending-Brief" }),
      assistantRoutes("exec_1"),
    ];
    const merged = mergeServiceAiMessages(disk, memory);
    expect(merged.filter((m) => m.role === "user")).toHaveLength(1);
    expect(merged.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("9. retry does not duplicate the original user message", () => {
    const merged = mergeServiceAiMessages([
      userMsg("Retry brief", {
        dedupeKey: "user-exec-exec_r",
        executionId: "exec_r",
      }),
      {
        ...assistantRoutes("exec_r"),
        text: "Generation failed.",
        failed: true,
        dedupeKey: "fail-exec_r",
        clientMessageId: "fail-exec_r",
      },
    ]);
    expect(merged.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("10. internal execution prompts never become visible messages", () => {
    expect(
      isInternalExecutionPrompt(
        "[REFINE MODE]\n[User brief]\nReal brief\n[Output requirements]"
      )
    ).toBe(true);
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [],
      state: baseState,
      latestUserMessage:
        "[Product selection]\n[User brief]\nActual user text only",
    });
    expect(ctx.latestUserInstruction).toBe("Actual user text only");
  });

  it("11. service A cannot use service B active artifact (isolated state)", () => {
    const presentationState: ServiceAiConversationState = {
      service: "presentations",
      productPath: "presentations/pitch-decks",
      activeExecutionId: "exec_pres",
    };
    const websiteState: ServiceAiConversationState = {
      service: "website",
      productPath: "website/landing-pages",
      activeExecutionId: "exec_web",
    };
    const presCtx = buildExecutionContextFromConversation({
      conversationId: "conv_pres",
      channelId: "service_pres",
      messages: [assistantRoutes("exec_pres")],
      state: presentationState,
      latestUserMessage: "Make route 2 premium",
    });
    const webCtx = buildExecutionContextFromConversation({
      conversationId: "conv_web",
      channelId: "service_web",
      messages: [assistantRoutes("exec_web")],
      state: websiteState,
      latestUserMessage: "Make the hero more minimal",
    });
    expect(presCtx.refineFromExecutionId).toBe("exec_pres");
    expect(webCtx.refineFromExecutionId).toBe("exec_web");
    expect(presCtx.refineFromExecutionId).not.toBe(webCtx.refineFromExecutionId);
  });

  it("12. brand context remains on conversation state", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [],
      state: { ...baseState, brandId: "brand_dusini" },
      latestUserMessage: "Add pricing",
    });
    expect(ctx.brandId).toBe("brand_dusini");
    expect(ctx.service).toBe("presentations");
  });

  it("13. export uses current active execution", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [assistantRoutes("exec_deck_v3")],
      state: { ...baseState, activeExecutionId: "exec_deck_v3" },
      latestUserMessage: "Export this as PPTX",
    });
    expect(ctx.intent).toBe("export");
    expect(ctx.activeExecutionId).toBe("exec_deck_v3");
    expect(ctx.exportFormat).toBe("pptx");
    expect(ctx.refineFromExecutionId).toBeUndefined();
  });

  it("14. conversation history survives merge (ordered)", () => {
    const merged = mergeServiceAiMessages([
      userMsg("First", { createdAt: "2026-01-01T00:00:00.000Z" }),
      assistantRoutes("exec_1", { createdAt: "2026-01-01T00:01:00.000Z" }),
      userMsg("Second", { createdAt: "2026-01-01T00:02:00.000Z" }),
    ]);
    expect(merged.map((m) => m.text)).toEqual([
      "First",
      "Here are your routes",
      "Second",
    ]);
  });

  it("15. in-progress execution id is exposed on state for reload resume", () => {
    const state: ServiceAiConversationState = {
      ...baseState,
      inProgressExecutionId: "exec_running",
      activeExecutionId: "exec_deck_v1",
    };
    expect(state.inProgressExecutionId).toBe("exec_running");
    expect(state.activeExecutionId).toBe("exec_deck_v1");
  });
});
