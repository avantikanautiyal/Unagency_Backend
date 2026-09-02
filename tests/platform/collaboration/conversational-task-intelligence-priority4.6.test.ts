/**
 * Priority 4.6 — Requirement-to-Execution Resolution & Deliverable Compliance.
 * Deterministic tests — no paid provider calls.
 */

import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import {
  evaluateDeliverableCompliance,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  resolveConversationalTurn,
  resolveExecutionSpecification,
  extractSemanticSignals,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { resolveServiceOutputSpec } from "../../../src/platform/config/service-output-map";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { activeRequirements } from "../../../src/platform/collaboration/conversational-task-intelligence/requirement-lifecycle";

const TERRA_LOOP_PROMPT =
  "Create one final name for TerraLoop's recyclable mailer range and one final six-word tagline. Explain the rationale in two sentences. Output: PDF and editable text. Size: 1920×1080 px, one-page board.";

function userMsg(
  text: string,
  overrides: Partial<ServiceAiMessageRecord> = {},
): ServiceAiMessageRecord {
  const dedupeKey = overrides.dedupeKey ?? `user-${text.slice(0, 24)}`;
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

function brandingTaglinesState(
  overrides: Partial<ServiceAiConversationState> = {},
): ServiceAiConversationState {
  return {
    service: "branding",
    subtype: "brand-naming-taglines",
    brandId: "brand1",
    productPath: "branding/brand-naming-taglines",
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
    messages: input.messages ?? [],
    state: input.state ?? brandingTaglinesState(),
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
}

function specFormats(turn: ReturnType<typeof resolveTurn>): string[] {
  return (turn.executionSpec?.deliverables ?? []).map((d) => d.format);
}

describe("Priority 4.6 — Requirement-to-Execution Resolution", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  describe("TerraLoop regression — branding/taglines", () => {
    it("resolves canonical spec; service default cannot override explicit requirements", () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const spec = turn.executionSpec!;
      expect(spec).toBeDefined();
      expect(spec.planeVersion).toBe("p4.6.0");

      // Service default is text + 3 directions — explicit user must win
      const serviceDefault = resolveServiceOutputSpec({
        service: "branding",
        subtype: "brand-naming-taglines",
      });
      expect(serviceDefault.kind).toBe("text");

      expect(spec.outputIntent.mode.value).toBe("FINAL");
      expect(spec.outputIntent.mode.provenance.explicit).toBe(true);
      expect(spec.outputIntent.alternativesRequested?.value).toBe(false);

      const nameItem = spec.content.contentItems?.find((i) => i.value.role === "name");
      const taglineItem = spec.content.contentItems?.find((i) => i.value.role === "tagline");
      expect(nameItem?.value.quantity).toBe(1);
      expect(taglineItem?.value.quantity).toBe(1);
      expect(taglineItem?.value.wordCount).toBe(6);

      expect(spec.outputIntent.rationaleRequired?.value).toBe(true);
      expect(spec.outputIntent.rationaleSentenceCount?.value).toBe(2);

      expect(spec.technical.width?.value).toBe(1920);
      expect(spec.technical.height?.value).toBe(1080);
      expect(spec.technical.pageCount?.value).toBe(1);

      expect(specFormats(turn)).toEqual(
        expect.arrayContaining(["PDF", "EDITABLE_TEXT"]),
      );
      // Explicit user deliverables only — no silent service-default additions
      expect(specFormats(turn).filter((f) => f === "PDF" || f === "EDITABLE_TEXT").length).toBe(2);

      expect(spec.resolutionState).toBe("RESOLVED");
      expect(turn.requiresExecution).toBe(true);
    });
  });

  describe("cross-service deliverable resolution", () => {
    it("1. text service → explicit PDF overrides text default", () => {
      const turn = resolveTurn("Write copy for our launch. Output: PDF.", {
        state: { service: "copywriting", subtype: "social" },
      });
      expect(specFormats(turn)).toContain("PDF");
    });

    it("2. image service → explicit PNG + dimensions", () => {
      const turn = resolveTurn("Create the image as PNG at 1080×1350", {
        state: { service: "social", subtype: "posts" },
      });
      expect(specFormats(turn)).toContain("PNG");
      expect(turn.executionSpec?.technical.width?.value).toBe(1080);
      expect(turn.executionSpec?.technical.height?.value).toBe(1350);
    });

    it("3. presentation service → explicit PPTX + PDF", () => {
      const turn = resolveTurn(
        "Create a presentation and export both PPTX and PDF",
        { state: { service: "presentations", subtype: "pitch-decks" } },
      );
      expect(specFormats(turn)).toEqual(
        expect.arrayContaining(["PPTX", "PDF"]),
      );
    });

    it("4. document service → explicit DOCX", () => {
      const turn = resolveTurn("Give me the report as DOCX", {
        state: { service: "print", subtype: "brochures" },
      });
      expect(specFormats(turn)).toContain("DOCX");
    });

    it("5. email service → explicit HTML", () => {
      const turn = resolveTurn("Create the email and give me the HTML", {
        state: { service: "email", subtype: "newsletters" },
      });
      expect(specFormats(turn)).toContain("HTML");
    });
  });

  describe("output intent — final vs alternatives", () => {
    it("6. one final result overrides multi-direction service default", () => {
      const turn = resolveTurn("Create one final logo for Acme", {
        state: { service: "branding", subtype: "taglines" },
      });
      expect(turn.executionSpec?.outputIntent.mode.value).toBe("FINAL");
      expect(turn.executionSpec?.content.quantity?.value).toBe(1);
    });

    it("7. explicit alternatives preserved", () => {
      const turn = resolveTurn("Give me 5 naming directions", {
        state: brandingTaglinesState(),
      });
      expect(turn.executionSpec?.outputIntent.mode.value).toBe("ALTERNATIVES");
      expect(turn.executionSpec?.content.quantity?.value).toBe(5);
    });
  });

  describe("requirement lifecycle merging", () => {
    it("8. MODIFY requirement accumulates", () => {
      const first = resolveTurn("Create 5 logo directions.", {
        state: { service: "branding", subtype: "logos", activeExecutionId: "exec1" },
      });
      const state = {
        service: "branding",
        subtype: "logos",
        activeExecutionId: "exec1",
        taskIntelligence: first.updatedTaskState,
      };
      const second = resolveTurn("Make it monochrome.", { state });
      expect(["MODIFY", "REGENERATE", "VARIATE"]).toContain(second.action);
      expect(second.executionSpec?.executionInstruction.toLowerCase()).toContain("monochrome");
    });

    it("9. REMOVE requirement", () => {
      const turn = resolveTurn("Remove the tagline.", {
        state: brandingTaglinesState({ activeExecutionId: "exec1" }),
        messages: [userMsg("Create taglines"), userMsg("Add CTA")],
      });
      expect(turn.action).toBe("REMOVE");
    });

    it("10. REPLACE requirement", () => {
      const first = resolveTurn("Create a premium website", {
        state: { service: "website", subtype: "landing-pages" },
      });
      const state = { service: "website", subtype: "landing-pages", taskIntelligence: first.updatedTaskState };
      const second = resolveTurn("Actually use blue and yellow instead", { state });
      expect(second.action).toBe("REPLACE");
      const palette = activeRequirements(second.effectiveRequirements).find(
        (r) => r.key === "palette",
      );
      expect(palette?.value.toLowerCase()).toContain("blue");
    });
  });

  describe("ambiguity and unsupported deliverables", () => {
    it("11. conflicting/vague requirements → clarification", () => {
      const turn = resolveTurn("Make it bigger.", { messages: [] });
      expect(turn.clarification).toBeDefined();
      expect(turn.requiresExecution).toBe(false);
    });

    it("12. unsupported explicit output → structured failure, not silent fallback", () => {
      const spec = resolveExecutionSpecification({
        message: "Create copy and give me MP4 video export",
        signals: extractSemanticSignals("Create copy and give me MP4 video export"),
        action: "CREATE",
        requirements: [],
        service: "copywriting",
        subtype: "social",
      });
      expect(spec.unsupportedDeliverables).toContain("MP4");
      expect(spec.resolutionState).toBe("UNSUPPORTED_DELIVERABLE");
      expect(spec.deliverables.some((d) => d.format === "MP4")).toBe(true);
    });
  });

  describe("multi-turn behavior", () => {
    it("turn 1 options → turn 2 final → turn 3 PDF export", () => {
      const t1 = resolveTurn("Create 5 options.", { state: brandingTaglinesState() });
      expect(t1.executionSpec?.content.quantity?.value).toBe(5);

      const state2 = { ...brandingTaglinesState(), taskIntelligence: t1.updatedTaskState };
      const t2 = resolveTurn("Actually, give me one final option.", { state: state2 });
      expect(t2.executionSpec?.content.quantity?.value).toBe(1);
      expect(t2.executionSpec?.outputIntent.mode.value).toBe("FINAL");

      const state3 = { ...state2, taskIntelligence: t2.updatedTaskState };
      const t3 = resolveTurn("Export it as PDF.", { state: state3 });
      expect(specFormats(t3)).toContain("PDF");
      expect(t3.executionSpec?.outputIntent.mode.value).toBe("FINAL");
    });
  });

  describe("execution context integration", () => {
    it("buildExecutionContextFromConversation includes executionSpec", () => {
      const ctx = buildExecutionContextFromConversation({
        conversationId: "conv1",
        channelId: "service_abc",
        messages: [],
        state: brandingTaglinesState(),
        latestUserMessage: TERRA_LOOP_PROMPT,
      });
      expect(ctx.executionSpec).toBeDefined();
      expect(ctx.executionSpec?.outputIntent.mode.value).toBe("FINAL");
      expect(ctx.effectiveInstruction).toContain("PDF");
    });
  });

  describe("deliverable compliance", () => {
    it("detects missing required deliverable", () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const report = evaluateDeliverableCompliance({
        spec: turn.executionSpec,
        presentFormats: ["EDITABLE_TEXT"],
        generatedQuantity: 3,
      });
      expect(report.overallStatus).toBe("DELIVERABLE_COMPLIANCE_FAILURE");
      expect(report.results.some((r) => r.checkId === "deliverable.PDF" && r.status === "FAIL")).toBe(
        true,
      );
      expect(report.results.some((r) => r.checkId === "content.quantity" && r.status === "FAIL")).toBe(
        true,
      );
    });

    it("passes when deliverables and quantity match", () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const report = evaluateDeliverableCompliance({
        spec: turn.executionSpec,
        presentFormats: ["PDF", "EDITABLE_TEXT"],
        generatedQuantity: 1,
        generatedWidth: 1920,
        generatedHeight: 1080,
      });
      expect(report.results.filter((r) => r.status === "FAIL").length).toBe(0);
    });
  });
});
