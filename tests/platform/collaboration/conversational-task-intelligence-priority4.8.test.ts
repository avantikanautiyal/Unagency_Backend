/**
 * Priority 4.8 — Requirement enforcement & generation compliance.
 */

import { appendOutputRequirementsToPrompt } from "../../../src/platform/direct/append-output-requirements";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import {
  evaluateDeliverableCompliance,
  extractNegativeConstraintsFromMessage,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  resolveConversationalTurn,
  userTaskRequirementsFromExecutionSpec,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { freezeExecutionSpecSnapshot } from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-snapshot";

function userMsg(text: string): ServiceAiMessageRecord {
  return {
    id: `u-${text.slice(0, 12)}`,
    conversationId: "conv1",
    channelId: "service_abc",
    role: "user",
    text,
    createdAt: "2026-06-01T10:00:00.000Z",
    clientMessageId: `user-${text.slice(0, 12)}`,
    dedupeKey: `user-${text.slice(0, 12)}`,
  };
}

function logoState(): ServiceAiConversationState {
  return {
    service: "branding",
    subtype: "logos",
    brandId: "brand1",
    productPath: "branding/logos",
    activeExecutionId: "exec_logo_v1",
    activeArtifactId: "art_logo_v1",
  };
}

function resolveTurnPair(
  turn1: string,
  turn2: string,
  options: { service?: string; subtype?: string } = {},
) {
  const state0: ServiceAiConversationState = {
    service: options.service ?? "branding",
    subtype: options.subtype ?? "logos",
    brandId: "brand1",
    productPath: "branding/logos",
  };
  const t1 = resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage: turn1,
    messages: [],
    state: state0,
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
  const messages = [userMsg(turn1)];
  const state1 = {
    ...state0,
    activeExecutionId: "exec_logo_v1",
    taskIntelligence: Object.freeze({
      ...t1.updatedTaskState,
      threads: Object.freeze(
        t1.updatedTaskState.threads.map((thread) =>
          thread.threadId === t1.activeThreadId
            ? Object.freeze({ ...thread, lastExecutionSpec: t1.executionSpec })
            : thread,
        ),
      ),
    }),
  };
  const t2 = resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage: turn2,
    messages,
    state: state1,
    nowIso: () => "2026-06-15T00:00:01.000Z",
  });
  return { t1, t2, state1 };
}

describe("Priority 4.8 — Requirement enforcement & generation compliance", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("mandatory regression — no leaf icons survives regenerate turn", () => {
    const { t1, t2 } = resolveTurnPair(
      "Create a logo for TerraLoop. Do not use leaf icons.",
      "Generate again properly. I specifically said no leaf icons.",
    );

    expect(t1.executionSpec?.creative.negativeConstraints?.length).toBeGreaterThan(0);
    const leaf = t1.executionSpec?.creative.negativeConstraints?.find((c) =>
      c.value.normalizedConcept.includes("leaf"),
    );
    expect(leaf?.value.enforcement).toBe("HARD_CONSTRAINT");

    expect(t2.action).toBe("REGENERATE");
    expect(t2.action).not.toBe("CREATE");
    const leafPersisted = t2.executionSpec?.creative.negativeConstraints?.find((c) =>
      c.value.normalizedConcept.includes("leaf"),
    );
    expect(leafPersisted).toBeDefined();
    expect(t2.executionSpec?.executionInstruction).toMatch(/HARD CONSTRAINT.*leaf/i);

    const snapshot = freezeExecutionSpecSnapshot({
      executionId: "exec_regen_1",
      spec: t2.executionSpec!,
    });
    const providerPrompt = appendOutputRequirementsToPrompt({
      prompt: t2.executionSpec!.executionInstruction,
      metadata: { executionSpecSnapshot: snapshot, productAction: "route_visual" },
    });
    expect(providerPrompt).toMatch(/HARD CONSTRAINT.*leaf/i);
    expect(providerPrompt).toMatch(/\[User requirements — negative constraints\]/);

    const reqs = userTaskRequirementsFromExecutionSpec(t2.executionSpec!);
    expect(reqs.some((r) => r.id.includes("leaf"))).toBe(true);
  });

  it("A — no green persists after premium modification", () => {
    const { t2 } = resolveTurnPair(
      "Create a website. Do not use green.",
      "Make it more premium.",
      { service: "website", subtype: "landing-pages" },
    );
    expect(
      t2.executionSpec?.creative.negativeConstraints?.some((c) =>
        c.value.normalizedConcept.includes("green"),
      ),
    ).toBe(true);
  });

  it("B — no rounded cards persists on regenerate", () => {
    const { t2 } = resolveTurnPair(
      "Create a website without rounded cards.",
      "Regenerate it.",
      { service: "website", subtype: "landing-pages" },
    );
    expect(
      t2.executionSpec?.creative.negativeConstraints?.some((c) =>
        c.value.normalizedConcept.includes("rounded"),
      ),
    ).toBe(true);
    expect(t2.action).toBe("REGENERATE");
  });

  it("C — final one logo + no leaf + monochrome merge", () => {
    const { t2 } = resolveTurnPair(
      "Create one final logo. No leaf symbols.",
      "Make it monochrome.",
    );
    expect(t2.executionSpec?.outputIntent.mode.value).toBe("FINAL");
    expect(t2.executionSpec?.content.quantity?.value).toBe(1);
    expect(
      t2.executionSpec?.creative.negativeConstraints?.some((c) =>
        c.value.normalizedConcept.includes("leaf"),
      ),
    ).toBe(true);
    expect(t2.executionSpec?.executionInstruction.toLowerCase()).toMatch(/monochrome/);
  });

  it("D — no CTA persists when copy becomes more persuasive", () => {
    const { t2 } = resolveTurnPair(
      "Do not include a CTA.",
      "Make the copy more persuasive.",
      { service: "website", subtype: "landing-pages" },
    );
    expect(t2.executionSpec?.content.ctaRequired?.value).toBe(false);
  });

  it("E — vault logo requirement persists on regenerate", () => {
    const { t2 } = resolveTurnPair(
      "Use the logo from the brand vault.",
      "Regenerate.",
    );
    expect(t2.executionSpec?.brandAssets?.requirements?.some((a) => a.value.required)).toBe(
      true,
    );
    expect(t2.executionSpec?.executionInstruction).toMatch(/brand vault/i);
  });

  it("extractNegativeConstraintsFromMessage captures do-not-use green", () => {
    const negatives = extractNegativeConstraintsFromMessage(
      "Create a website. Do not use green.",
    );
    expect(negatives.some((c) => c.normalizedConcept.includes("green"))).toBe(true);
  });

  it("positive/negative conflict — allow green reverses no green", () => {
    const { t1, t2 } = resolveTurnPair(
      "Create a website. Do not use green.",
      "Actually use green accents.",
      { service: "website", subtype: "landing-pages" },
    );
    expect(
      t1.effectiveRequirements.some((r) => r.key === "negative_constraint") ||
        t1.executionSpec?.creative.negativeConstraints?.some((c) =>
          c.value.normalizedConcept.includes("green"),
        ),
    ).toBe(true);
    expect(
      t2.executionSpec?.creative.negativeConstraints?.some((c) =>
        c.value.normalizedConcept.includes("green"),
      ),
    ).toBe(false);
  });

  it("requirement compliance distinguishable from execution success", () => {
    const { t2 } = resolveTurnPair(
      "Create a logo for TerraLoop. Do not use leaf icons.",
      "Generate again properly. I specifically said no leaf icons.",
    );
    const report = evaluateDeliverableCompliance({
      spec: t2.executionSpec,
      previewText: "Logo with leaf motif and foliage elements",
    });
    expect(report.requirementComplianceStatus).toBe("REQUIREMENT_COMPLIANCE_FAILURE");
    expect(report.results.some((r) => r.checkId.includes("leaf") && r.status === "FAIL")).toBe(
      true,
    );
  });

  it("production path — buildExecutionContext carries negative constraints", () => {
    const t1 = resolveConversationalTurn({
      conversationId: "conv1",
      channelId: "service_abc",
      latestUserMessage: "Create a logo for TerraLoop. Do not use leaf icons.",
      messages: [],
      state: logoState(),
      nowIso: () => "2026-06-15T00:00:00.000Z",
    });
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv1",
      channelId: "service_abc",
      messages: [
        userMsg("Create a logo for TerraLoop. Do not use leaf icons."),
      ],
      state: {
        ...logoState(),
        taskIntelligence: Object.freeze({
          ...t1.updatedTaskState,
          threads: Object.freeze(
            t1.updatedTaskState.threads.map((thread) =>
              thread.threadId === t1.activeThreadId
                ? Object.freeze({ ...thread, lastExecutionSpec: t1.executionSpec })
                : thread,
            ),
          ),
        }),
      },
      latestUserMessage: "Generate again properly. I specifically said no leaf icons.",
    });
    expect(ctx.conversationalAction).toBe("REGENERATE");
    expect(ctx.executionSpec?.creative.negativeConstraints?.length).toBeGreaterThan(0);
    expect(ctx.effectiveInstruction).toMatch(/HARD CONSTRAINT/i);
  });
});
