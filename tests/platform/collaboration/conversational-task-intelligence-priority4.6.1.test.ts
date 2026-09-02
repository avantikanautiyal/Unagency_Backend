/**
 * Priority 4.6.1 — Real application requirement-to-artifact validation & production wiring.
 * Deterministic integration tests — no paid provider calls.
 */

import {
  resolveConversationalTurn,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
  stampExecutionSpecMetadata,
  readExecutionSpecSnapshot,
  freezeExecutionSpecSnapshot,
  evaluateDeliverableCompliance,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import { resolveProductionValidationAsync } from "../../../src/platform/providers/routing/performance/benchmark/production/production-validation-resolver";
import { hookProductionEvidenceAfterFinalize } from "../../../src/platform/providers/routing/performance/benchmark/production/production-evidence-hook";
import { clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { getExecutionTrace } from "../../../src/platform/os/observability/execution-trace";

const TERRA_LOOP_PROMPT =
  "Brand: TerraLoop. Deliverable: Recyclable mailer range naming. Size: 1920 x 1080 px, one-page board. Create one final name for TerraLoop's recyclable mailer range and one final six-word tagline. The name must be easy to pronounce, modern and connected to circular packaging without using \"eco\" or \"green\". Explain the rationale in two sentences. CTA: No CTA. Output: PDF and editable text.";

function userMsg(text: string, overrides: Partial<ServiceAiMessageRecord> = {}): ServiceAiMessageRecord {
  const dedupeKey = overrides.dedupeKey ?? `user-${text.slice(0, 20)}`;
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

function brandingState(
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
  input: { messages?: ServiceAiMessageRecord[]; state?: ServiceAiConversationState } = {},
) {
  return resolveConversationalTurn({
    conversationId: "conv1",
    channelId: "service_abc",
    latestUserMessage,
    messages: input.messages ?? [],
    state: input.state ?? brandingState(),
    nowIso: () => "2026-06-15T00:00:00.000Z",
  });
}

function simulatePrepassMetadata(input: {
  executionId: string;
  turn: ReturnType<typeof resolveTurn>;
  baseMetadata?: Record<string, unknown>;
}) {
  const spec = input.turn.executionSpec!;
  return stampExecutionSpecMetadata(
    {
      channelId: "service_abc",
      conversationId: "conv1",
      service: "branding",
      subtype: "brand-naming-taglines",
      ...input.baseMetadata,
    },
    { executionId: input.executionId, spec, nowIso: () => "2026-06-15T00:00:00.000Z", createId: (p) => `${p}_test` },
  );
}

async function simulateProductionValidation(input: {
  executionId: string;
  metadata: Record<string, unknown>;
  preview?: string;
  presentDeliverableFormats?: readonly ("PDF" | "EDITABLE_TEXT" | "PNG" | "PPTX" | "DOCX" | "HTML")[];
  generatedQuantity?: number;
  generatedWidth?: number;
  generatedHeight?: number;
}) {
  clearValidationCache();
  const snapshot = readExecutionSpecSnapshot(input.metadata);
  return resolveProductionValidationAsync({
    context: {
      organizationId: "org_p461",
      productionExecutionId: input.executionId,
      providerId: "provider.test",
      modelId: "test/model",
      capabilityId: "text.generate",
      service: String(input.metadata.service ?? "branding"),
      subtype: String(input.metadata.subtype ?? "brand-naming-taglines"),
      outputKind: "text",
      preview: input.preview ?? "TerraLoop recyclable mailer naming deliverable output.",
      briefObjective: snapshot?.spec.executionInstruction,
      executionSpec: snapshot?.spec,
      executionSpecSnapshot: snapshot,
      presentDeliverableFormats: input.presentDeliverableFormats,
      generatedQuantity: input.generatedQuantity,
      generatedWidth: input.generatedWidth,
      generatedHeight: input.generatedHeight,
      latencyMs: 100,
      providerSuccess: true,
      createId: (p) => `${p}_${input.executionId}`,
      nowIso: () => "2026-06-15T00:00:00.000Z",
    },
  });
}

describe("Priority 4.6.1 — Production wiring & E2E handoff", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
    clearValidationCache();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  describe("TerraLoop golden — resolution through production validation", () => {
    it("handoff: conversation → spec → prepass metadata → Step 2 + compliance", async () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const spec = turn.executionSpec!;
      expect(spec.outputIntent.mode.value).toBe("FINAL");
      expect(spec.content.quantity?.value).toBe(1);

      const nameItem = spec.content.contentItems?.find((i) => i.value.role === "name");
      const taglineItem = spec.content.contentItems?.find((i) => i.value.role === "tagline");
      expect(nameItem?.value.quantity).toBe(1);
      expect(taglineItem?.value.quantity).toBe(1);
      expect(taglineItem?.value.wordCount).toBe(6);
      expect(spec.outputIntent.rationaleSentenceCount?.value).toBe(2);
      expect(spec.content.ctaRequired?.value).toBe(false);
      expect(spec.technical.width?.value).toBe(1920);
      expect(spec.technical.height?.value).toBe(1080);
      expect(spec.technical.pageCount?.value).toBe(1);
      expect(spec.deliverables.map((d) => d.format)).toEqual(
        expect.arrayContaining(["PDF", "EDITABLE_TEXT"]),
      );

      const metadata = simulatePrepassMetadata({ executionId: "exec_terra", turn });
      const snapshot = readExecutionSpecSnapshot(metadata);
      expect(snapshot?.executionId).toBe("exec_terra");
      expect(snapshot?.spec.outputIntent.mode.value).toBe("FINAL");

      const outcome = await simulateProductionValidation({
        executionId: "exec_terra",
        metadata,
        presentDeliverableFormats: ["PDF", "EDITABLE_TEXT"],
        generatedQuantity: 1,
        generatedWidth: 1920,
        generatedHeight: 1080,
      });

      expect(outcome.requirementComplianceAvailable).toBe(true);
      expect(outcome.validation).toBeDefined();
      expect(outcome.deliverableCompliance?.overallStatus).toBe("COMPLIANT");

      const failOutcome = await simulateProductionValidation({
        executionId: "exec_terra_fail",
        metadata,
        presentDeliverableFormats: ["EDITABLE_TEXT"],
        generatedQuantity: 3,
      });
      expect(failOutcome.deliverableCompliance?.overallStatus).toBe(
        "DELIVERABLE_COMPLIANCE_FAILURE",
      );
    });
  });

  describe("multi-turn golden lifecycle", () => {
    it("turn 1 options → turn 2 final → turn 3 PDF → turn 4 tagline modify", async () => {
      const t1 = resolveTurn("Create 5 naming directions for the product.", {
        state: brandingState(),
      });
      expect(t1.executionSpec?.content.quantity?.value).toBe(5);

      const state2 = { ...brandingState(), taskIntelligence: t1.updatedTaskState };
      const t2 = resolveTurn("Actually, give me only one final direction.", { state: state2 });
      expect(t2.executionSpec?.content.quantity?.value).toBe(1);
      expect(t2.executionSpec?.outputIntent.mode.value).toBe("FINAL");

      const state3 = { ...state2, taskIntelligence: t2.updatedTaskState };
      const t3 = resolveTurn("Export it as PDF and editable text.", { state: state3 });
      expect(t3.executionSpec?.outputIntent.mode.value).toBe("FINAL");
      expect(t3.executionSpec?.deliverables.map((d) => d.format)).toEqual(
        expect.arrayContaining(["PDF", "EDITABLE_TEXT"]),
      );

      const state4 = { ...state3, taskIntelligence: t3.updatedTaskState };
      const t4 = resolveTurn("Make the tagline shorter.", { state: state4 });
      expect(t4.executionSpec?.outputIntent.mode.value).toBe("FINAL");
      expect(t4.executionSpec?.content.quantity?.value).toBe(1);
      expect(t4.executionSpec?.deliverables.map((d) => d.format)).toEqual(
        expect.arrayContaining(["PDF", "EDITABLE_TEXT"]),
      );
    });
  });

  describe("immutable execution snapshots", () => {
    it("each execution retains its own frozen spec — later turns do not mutate prior", () => {
      const t1 = resolveTurn("Create 5 naming directions.", { state: brandingState() });
      const snapA = freezeExecutionSpecSnapshot({
        executionId: "exec_a",
        spec: t1.executionSpec!,
        nowIso: "2026-06-15T00:00:00.000Z",
        createId: (p) => `${p}_a`,
      });

      const state2 = { ...brandingState(), taskIntelligence: t1.updatedTaskState };
      const t2 = resolveTurn("Actually, give me only one final direction.", { state: state2 });
      const snapB = freezeExecutionSpecSnapshot({
        executionId: "exec_b",
        spec: t2.executionSpec!,
        nowIso: "2026-06-15T00:00:01.000Z",
        createId: (p) => `${p}_b`,
      });

      expect(snapA.spec.content.quantity?.value).toBe(5);
      expect(snapB.spec.content.quantity?.value).toBe(1);
      expect(snapA.executionId).toBe("exec_a");
      expect(snapB.executionId).toBe("exec_b");
      expect(snapA.spec.outputIntent.mode.value).not.toBe(snapB.spec.outputIntent.mode.value);
    });
  });

  describe("durable conversation persistence", () => {
    it("lastExecutionSpec survives taskIntelligence state round-trip", () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const persisted: ServiceAiConversationState = {
        ...brandingState(),
        taskIntelligence: turn.updatedTaskState,
      };
      const thread = persisted.taskIntelligence!.threads.find(
        (t) => t.threadId === turn.activeThreadId,
      );
      expect(thread?.lastExecutionSpec).toBeDefined();
      expect(thread?.lastExecutionSpec?.outputIntent.mode.value).toBe("FINAL");

      const reloaded = buildExecutionContextFromConversation({
        conversationId: "conv1",
        channelId: "service_abc",
        messages: [userMsg(TERRA_LOOP_PROMPT)],
        state: persisted,
        latestUserMessage: TERRA_LOOP_PROMPT,
      });
      expect(reloaded.executionSpec?.outputIntent.mode.value).toBe("FINAL");
    });
  });

  describe("cross-service generic validation", () => {
    const cases: Array<{
      label: string;
      service: string;
      subtype: string;
      message: string;
      assert: (spec: NonNullable<ReturnType<typeof resolveTurn>["executionSpec"]>) => void;
    }> = [
      {
        label: "A. text → explicit PDF",
        service: "copywriting",
        subtype: "social",
        message: "Write launch copy. Give me this as PDF.",
        assert: (spec) => {
          expect(spec.deliverables.some((d) => d.format === "PDF")).toBe(true);
        },
      },
      {
        label: "B. image → PNG + dimensions",
        service: "social",
        subtype: "posts",
        message: "Create this as PNG at 1080×1350.",
        assert: (spec) => {
          expect(spec.deliverables.some((d) => d.format === "PNG")).toBe(true);
          expect(spec.technical.width?.value).toBe(1080);
          expect(spec.technical.height?.value).toBe(1350);
        },
      },
      {
        label: "C. presentation → PPTX + PDF",
        service: "presentations",
        subtype: "pitch-decks",
        message: "Create the presentation and give me both PPTX and PDF.",
        assert: (spec) => {
          expect(spec.deliverables.map((d) => d.format)).toEqual(
            expect.arrayContaining(["PPTX", "PDF"]),
          );
        },
      },
      {
        label: "D. document → editable DOCX",
        service: "print",
        subtype: "brochures",
        message: "Give me an editable DOCX.",
        assert: (spec) => {
          const docx = spec.deliverables.find((d) => d.format === "DOCX");
          expect(docx).toBeDefined();
        },
      },
      {
        label: "E. email → HTML",
        service: "email",
        subtype: "newsletters",
        message: "Create the email as HTML.",
        assert: (spec) => {
          expect(spec.deliverables.some((d) => d.format === "HTML")).toBe(true);
        },
      },
      {
        label: "F. finality overrides service default",
        service: "branding",
        subtype: "brand-naming-taglines",
        message: "Create one final result.",
        assert: (spec) => {
          expect(spec.outputIntent.mode.value).toBe("FINAL");
          expect(spec.content.quantity?.value).toBe(1);
        },
      },
      {
        label: "G. exploration preserves alternatives",
        service: "branding",
        subtype: "brand-naming-taglines",
        message: "Give me 5 alternatives.",
        assert: (spec) => {
          expect(spec.outputIntent.mode.value).toBe("ALTERNATIVES");
          expect(spec.content.quantity?.value).toBe(5);
        },
      },
    ];

    it.each(cases)("$label", ({ service, subtype, message, assert }) => {
      const turn = resolveTurn(message, {
        state: { service, subtype },
      });
      expect(turn.executionSpec).toBeDefined();
      assert(turn.executionSpec!);
    });
  });

  describe("legacy compatibility", () => {
    it("production validation without executionSpec marks compliance unavailable", async () => {
      const outcome = await resolveProductionValidationAsync({
        context: {
          organizationId: "org_legacy",
          productionExecutionId: "exec_legacy",
          providerId: "provider.test",
          modelId: "test/model",
          capabilityId: "text.generate",
          service: "copywriting",
          subtype: "social",
          outputKind: "text",
          preview: "Legacy execution output without conversational spec.",
          briefObjective: "Legacy brief",
          latencyMs: 50,
          providerSuccess: true,
          createId: (p) => `${p}_legacy`,
          nowIso: () => "2026-06-15T00:00:00.000Z",
        },
      });
      expect(outcome.requirementComplianceAvailable).toBe(false);
      expect(outcome.deliverableCompliance).toBeUndefined();
      expect(outcome.validation).toBeDefined();
    });
  });

  describe("production evidence hook wiring", () => {
    it("hookProductionEvidenceAfterFinalize accepts executionSpec snapshot from metadata", () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const metadata = simulatePrepassMetadata({ executionId: "exec_hook", turn });

      expect(() => {
        hookProductionEvidenceAfterFinalize({
          organizationId: "org_hook",
          executionId: "exec_hook",
          capabilityId: "text.generate",
          providerId: "provider.test",
          modelId: "test/model",
          service: "branding",
          subtype: "brand-naming-taglines",
          outputKind: "text",
          preview: "TerraLoop naming output",
          providerSuccess: true,
          latencyMs: 100,
          metadata,
          presentDeliverableFormats: ["PDF", "EDITABLE_TEXT"],
          generatedQuantity: 1,
          createId: (p) => `${p}_hook`,
          nowIso: () => "2026-06-15T00:00:00.000Z",
        });
      }).not.toThrow();
    });
  });

  describe("artifact compliance — spec vs actual", () => {
    it("distinguishes resolution success from compliance failure", () => {
      const turn = resolveTurn(TERRA_LOOP_PROMPT, { messages: [] });
      const spec = turn.executionSpec!;

      const resolutionOk = spec.resolutionState === "RESOLVED";
      expect(resolutionOk).toBe(true);

      const compliant = evaluateDeliverableCompliance({
        spec,
        presentFormats: ["PDF", "EDITABLE_TEXT"],
        generatedQuantity: 1,
        generatedWidth: 1920,
        generatedHeight: 1080,
      });
      expect(compliant.overallStatus).toBe("COMPLIANT");

      const nonCompliant = evaluateDeliverableCompliance({
        spec,
        presentFormats: ["EDITABLE_TEXT"],
        generatedQuantity: 3,
        generatedWidth: 1080,
        generatedHeight: 1350,
      });
      expect(nonCompliant.overallStatus).toBe("DELIVERABLE_COMPLIANCE_FAILURE");
      expect(nonCompliant.results.some((r) => r.checkId === "deliverable.PDF")).toBe(true);
      expect(nonCompliant.results.some((r) => r.checkId === "content.quantity")).toBe(true);
      expect(nonCompliant.results.some((r) => r.checkId === "technical.dimensions")).toBe(true);
    });
  });
});
