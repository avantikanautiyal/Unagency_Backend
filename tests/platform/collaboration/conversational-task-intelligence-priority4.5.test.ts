/**
 * Priority 4.5 — Conversational task intelligence (deterministic, no provider calls).
 */

import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import {
  activeRequirements,
  applyRequirementOperations,
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

function assistantRoutes(
  executionId: string,
  overrides: Partial<ServiceAiMessageRecord> = {},
): ServiceAiMessageRecord {
  return {
    id: overrides.id ?? `ai-${executionId}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "assistant",
    text: "Here are your routes",
    createdAt: overrides.createdAt ?? "2026-06-01T10:01:00.000Z",
    clientMessageId: `routes-${executionId}`,
    dedupeKey: `routes-${executionId}`,
    executionId,
    artifactId: overrides.artifactId ?? `art_${executionId}`,
    routes: overrides.routes ?? [
      { id: "r1", label: "Route 1", title: "Bold" },
      { id: "r2", label: "Route 2", title: "Premium" },
      { id: "r3", label: "Route 3", title: "Minimal" },
    ],
    ...overrides,
  };
}

function baseState(
  overrides: Partial<ServiceAiConversationState> = {},
): ServiceAiConversationState {
  return {
    service: "website",
    subtype: "landing-pages",
    brandId: "brand1",
    productPath: "website/landing-pages",
    activeExecutionId: "exec_v1",
    activeArtifactId: "art_v1",
    selectedRouteId: "r2",
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
  return resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage,
    messages: input.messages ?? [
      userMsg("Create a premium black and silver website"),
      assistantRoutes("exec_v1"),
    ],
    state: input.state ?? baseState(),
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
}

describe("Priority 4.5 — Conversational task intelligence", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("1. initial creation resolves CREATE without prior deliverable", () => {
    const turn = resolveTurn("Create a premium landing page for our SaaS product", {
      messages: [],
      state: { service: "website", subtype: "landing-pages" },
    });
    expect(turn.action).toBe("CREATE");
    expect(turn.requiresExecution).toBe(true);
  });

  it("2. simple follow-up refines active deliverable", () => {
    const turn = resolveTurn("Make it more editorial");
    expect(["MODIFY", "REGENERATE", "VARIATE"]).toContain(turn.action);
    expect(turn.requiresExecution).toBe(true);
    expect(turn.reference?.executionId).toBe("exec_v1");
  });

  it("3. modification updates requirements", () => {
    const turn = resolveTurn("Make the headline stronger");
    expect(turn.action).toBe("MODIFY");
    expect(turn.effectiveRequirements.some((r) => r.key === "headline")).toBe(true);
  });

  it("4. refinement preserves execution reference", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [userMsg("Website brief"), assistantRoutes("exec_v1")],
      state: baseState(),
      latestUserMessage: "More premium feel",
    });
    expect(ctx.refineFromExecutionId).toBe("exec_v1");
    expect(ctx.conversationalAction).toBe("MODIFY");
  });

  it("5. regeneration intent from retry language", () => {
    const turn = resolveTurn("Try again with a different direction");
    expect(["REGENERATE", "VARIATE"]).toContain(turn.action);
    expect(turn.requiresExecution).toBe(true);
  });

  it("6. variation requests map to VARIATE with active deliverable", () => {
    const turn = resolveTurn("Give me a few different directions");
    expect(turn.action).toBe("VARIATE");
  });

  it("7. extension/continuation maps to CONTINUE", () => {
    const turn = resolveTurn("Continue building out the site");
    expect(turn.action).toBe("CONTINUE");
  });

  it("8. transformation creates related execution context", () => {
    const turn = resolveTurn("Now create an email from this");
    expect(turn.action).toBe("TRANSFORM");
    expect(turn.reference?.executionId).toBe("exec_v1");
  });

  it("9. removal maps to REMOVE", () => {
    const turn = resolveTurn("Remove the testimonials section");
    expect(turn.action).toBe("REMOVE");
  });

  it("10. replacement supersedes prior requirement", () => {
    const first = resolveTurn("Create a premium black and silver website", {
      messages: [],
      state: { service: "website" },
    });
    const state = { ...baseState(), taskIntelligence: first.updatedTaskState };
    const second = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Actually use blue and yellow instead",
      messages: [userMsg("Create a premium black and silver website")],
      state,
      nowIso: () => "2026-06-15T00:00:00.000Z",
    });
    const palette = activeRequirements(second.effectiveRequirements).find(
      (r) => r.key === "palette",
    );
    expect(second.action).toBe("REPLACE");
    expect(palette?.value.toLowerCase()).toContain("blue");
  });

  it("11. reversion maps to REVERT", () => {
    const turn = resolveTurn("Go back to the original version");
    expect(turn.action).toBe("REVERT");
  });

  it("12. selection resolves route reference", () => {
    const turn = resolveTurn("Use the second route");
    expect(turn.reference?.routeIndex).toBe(2);
    expect(turn.reference?.routeId).toBe("r2");
  });

  it("13. comparison does not require execution", () => {
    const turn = resolveTurn("Compare the first and second options");
    expect(turn.action).toBe("COMPARE");
    expect(turn.requiresExecution).toBe(false);
  });

  it("14. explanation does not require execution", () => {
    const turn = resolveTurn("Why did you choose this direction?");
    expect(turn.action).toBe("EXPLAIN");
    expect(turn.requiresExecution).toBe(false);
  });

  it("15. critique/feedback does not auto-regenerate", () => {
    const turn = resolveTurn("I don't like this");
    expect(turn.action).toBe("REJECT");
    expect(turn.requiresExecution).toBe(false);
  });

  it("16. summarization is conversational", () => {
    const turn = resolveTurn("Summarize what we've decided so far");
    expect(turn.action).toBe("SUMMARIZE");
    expect(turn.requiresExecution).toBe(false);
  });

  it("17. correction via replacement updates effective spec", () => {
    const turn = resolveTurn("Change the palette to navy and gold");
    expect(turn.action).toBe("REPLACE");
    expect(
      turn.effectiveRequirements.some((r) => r.key === "palette"),
    ).toBe(true);
  });

  it("18. approval can require execution when proposal pending", () => {
    const state = baseState({
      taskIntelligence: {
        planeVersion: "p4.5.1",
        threads: [],
        pendingProposal: {
          action: "MODIFY",
          summary: "Make hero more premium",
          proposedAt: "2026-06-01T00:00:00.000Z",
        },
      },
    });
    const turn = resolveTurn("Yes, do that", { state });
    expect(turn.action).toBe("APPROVE");
    expect(turn.requiresExecution).toBe(true);
  });

  it("19. rejection preserves state without execution", () => {
    const turn = resolveTurn("No, not that one");
    expect(turn.action).toBe("REJECT");
    expect(turn.requiresExecution).toBe(false);
  });

  it("20. underspecified turn requests clarification", () => {
    const turn = resolveTurn("?", {
      messages: [],
      state: { service: "website" },
    });
    expect(turn.clarification).toBeDefined();
    expect(turn.requiresExecution).toBe(false);
  });

  it("21. implicit deictic reference resolves to active execution", () => {
    const turn = resolveTurn("Make it bolder");
    expect(turn.reference?.executionId).toBe("exec_v1");
  });

  it("22. explicit artifact type reference in task switch", () => {
    const state = baseState({
      taskIntelligence: {
        planeVersion: "p4.5.1",
        activeThreadId: "thread_2",
        threads: [
          {
            threadId: "thread_1",
            label: "website",
            service: "website",
            status: "paused",
            requirements: [],
            decisions: [],
            alternatives: [],
            unresolvedAmbiguities: [],
            activeExecutionId: "exec_web",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
          {
            threadId: "thread_2",
            label: "email",
            service: "email",
            status: "active",
            requirements: [],
            decisions: [],
            alternatives: [],
            unresolvedAmbiguities: [],
            activeExecutionId: "exec_email",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    });
    const turn = resolveTurn("Back to the website", { state });
    expect(turn.reference?.threadId).toBe("thread_1");
  });

  it("23. version reference resolves to stored alternative", () => {
    const state = baseState({
      taskIntelligence: {
        planeVersion: "p4.5.1",
        activeThreadId: "thread_1",
        threads: [
          {
            threadId: "thread_1",
            status: "active",
            requirements: [],
            decisions: [],
            alternatives: [
              {
                executionId: "exec_v1",
                artifactId: "art_v1",
                createdAt: "2026-06-01T00:00:00.000Z",
              },
              {
                executionId: "exec_v2",
                artifactId: "art_v2",
                createdAt: "2026-06-02T00:00:00.000Z",
              },
            ],
            unresolvedAmbiguities: [],
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    });
    const turn = resolveTurn("Use version 2", { state });
    expect(turn.reference?.executionId).toBe("exec_v2");
    expect(turn.reference?.artifactId).toBe("art_v2");
  });

  it("24. multiple task threads remain isolated", () => {
    const web = resolveTurn("Make the hero darker", {
      state: baseState({ service: "website", activeExecutionId: "exec_web" }),
    });
    const email = resolveTurn("Shorten the subject line", {
      state: baseState({
        service: "email",
        subtype: "campaigns",
        activeExecutionId: "exec_email",
      }),
    });
    expect(web.reference?.executionId).toBe("exec_web");
    expect(email.reference?.executionId).toBe("exec_email");
  });

  it("25. requirements accumulate across turns", () => {
    const first = resolveTurn("Create a premium website", {
      messages: [],
      state: { service: "website" },
    });
    const state = { service: "website", taskIntelligence: first.updatedTaskState };
    const second = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Also include an FAQ section",
      messages: [userMsg("Create a premium website")],
      state,
      nowIso: () => "2026-06-15T00:00:00.000Z",
    });
    expect(
      second.effectiveRequirements.some((r) =>
        r.value.toLowerCase().includes("faq"),
      ),
    ).toBe(true);
  });

  it("26. requirement replacement supersedes prior palette", () => {
    const reqs = applyRequirementOperations({
      operations: [
        { kind: "SET_OBJECTIVE", value: "premium website" },
        { kind: "REPLACE", key: "palette", replacesKey: "palette", value: "blue and yellow" },
      ],
      existing: [
        {
          id: "req_palette_1",
          key: "palette",
          value: "black and silver",
          source: "EXPLICIT_USER",
          persistence: "PERSISTENT",
          status: "active",
          introducedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      source: "EXPLICIT_USER",
      persistence: "PERSISTENT",
      nowIso: "2026-06-02T00:00:00.000Z",
    });
    const active = activeRequirements(reqs);
    expect(active.filter((r) => r.key === "palette")).toHaveLength(1);
    expect(active.find((r) => r.key === "palette")?.value).toContain("blue");
  });

  it("27. requirement removal deactivates constraint", () => {
    const turn = resolveTurn("Remove the testimonials");
    expect(turn.action).toBe("REMOVE");
    const removed = turn.effectiveRequirements.find((r) => r.key === "constraint");
    expect(removed).toBeUndefined();
  });

  it("28. temporary requirement scope is tagged", () => {
    const turn = resolveTurn("For this version, make it minimal");
    const temp = turn.effectiveRequirements.find((r) => r.persistence === "TEMPORARY");
    expect(temp).toBeDefined();
  });

  it("29. persistent requirement scope is tagged", () => {
    const turn = resolveTurn("From now on, keep the brand tone premium", {
      messages: [],
      state: { service: "website" },
    });
    expect(
      turn.effectiveRequirements.some((r) => r.persistence === "PERSISTENT"),
    ).toBe(true);
  });

  it("30. contradictory replacement wins with latest requirement", () => {
    const turn = resolveTurn("Actually use blue and yellow instead");
    expect(turn.action).toBe("REPLACE");
    expect(turn.effectiveInstruction.toLowerCase()).toContain("blue");
  });

  it("31. ambiguous reference triggers clarification", () => {
    const turn = resolveTurn("Change it", {
      messages: [
        userMsg("Brief 1", { executionId: "exec_a" }),
        assistantRoutes("exec_a"),
        userMsg("Brief 2", { executionId: "exec_b" }),
        assistantRoutes("exec_b"),
      ],
      state: baseState({ activeExecutionId: undefined, activeArtifactId: undefined }),
    });
    expect(turn.clarification).toBeDefined();
    expect(turn.requiresExecution).toBe(false);
  });

  it("32. conversational question without execution", () => {
    const turn = resolveTurn("What file formats can you export?");
    expect(["INFORMATION_REQUEST", "EXPLAIN"]).toContain(turn.action);
    expect(turn.requiresExecution).toBe(false);
  });

  it("33. feedback without automatic regeneration", () => {
    const turn = resolveTurn("This feels too busy");
    expect(turn.action).toBe("REJECT");
    expect(turn.requiresExecution).toBe(false);
  });

  it("34. follow-up after successful artifact generation", () => {
    const turn = resolveTurn("Change only the hero section");
    expect(turn.reference?.executionId).toBe("exec_v1");
    expect(turn.requiresExecution).toBe(true);
  });

  it("35. follow-up after failed execution preserves clarify path", () => {
    const turn = resolveTurn("Retry", {
      messages: [
        userMsg("Create website"),
        {
          ...assistantRoutes("exec_fail"),
          failed: true,
          text: "Generation failed",
        },
      ],
      state: baseState({ activeExecutionId: "exec_fail" }),
    });
    expect(["REGENERATE", "VARIATE", "CREATE"]).toContain(turn.action);
  });

  it("36. follow-up after partial execution still references active thread", () => {
    const turn = resolveTurn("Keep everything except the CTA", {
      state: baseState({ inProgressExecutionId: "exec_partial" }),
    });
    expect(turn.activeThreadId).toBeDefined();
    expect(turn.requiresExecution).toBe(true);
  });

  it("37. context preservation across multiple turns", () => {
    const first = resolveTurn("Create a premium website", {
      messages: [],
      state: { service: "website" },
    });
    const second = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Make it more editorial",
      messages: [
        userMsg("Create a premium website"),
        assistantRoutes("exec_v1"),
      ],
      state: { service: "website", taskIntelligence: first.updatedTaskState },
      nowIso: () => "2026-06-15T00:00:00.000Z",
    });
    expect(second.effectiveInstruction.toLowerCase()).toContain("premium");
    expect(second.effectiveInstruction.toLowerCase()).toContain("editorial");
  });

  it("38. service switching within campaign uses task threads", () => {
    const turn = resolveTurn("Now work on the email campaign", {
      state: baseState({ service: "website" }),
    });
    expect(["TRANSFORM", "CREATE", "MODIFY"]).toContain(turn.action);
  });

  it("39. transformation between modalities references parent execution", () => {
    const turn = resolveTurn("Turn this into a presentation deck");
    expect(turn.action).toBe("TRANSFORM");
    expect(turn.reference?.executionId).toBe("exec_v1");
  });

  it("40. exact artifact/execution association in execution context", () => {
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [assistantRoutes("exec_v1", { artifactId: "art_exact" })],
      state: baseState({
        activeExecutionId: "exec_v1",
        activeArtifactId: "art_exact",
      }),
      latestUserMessage: "Use version 1",
    });
    expect(ctx.referencedExecutionId ?? ctx.refineFromExecutionId).toBe("exec_v1");
    expect(ctx.activeArtifactId).toBe("art_exact");
  });

  it("does not leak website context into email task thread", () => {
    const website = resolveTurn("Make the hero darker", {
      state: baseState({
        service: "website",
        activeExecutionId: "exec_web_only",
      }),
    });
    const email = resolveTurn("Shorten the preview text", {
      state: baseState({
        service: "email",
        subtype: "campaigns",
        activeExecutionId: "exec_email_only",
      }),
    });
    expect(website.reference?.executionId).not.toBe(email.reference?.executionId);
  });

  it("produces deterministic output on repeated resolution", () => {
    const input = {
      messages: [userMsg("Deck"), assistantRoutes("exec_d")],
      state: baseState(),
    };
    const a = resolveTurn("Make route 2 more premium", input);
    const b = resolveTurn("Make route 2 more premium", input);
    expect(a.action).toBe(b.action);
    expect(a.requiresExecution).toBe(b.requiresExecution);
    expect(a.effectiveInstruction).toBe(b.effectiveInstruction);
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});
