/**
 * Priority 4.9.1 — Website materialization, brand vault logo integrity, turn dedup, E2E.
 */

import {
  applyWebsiteExportToExecution,
  materializeWebsiteExport,
} from "../../../src/platform/api/services/website-export-materializer";
import { mapAnthropicResponseToCanonical } from "../../../src/platform/providers/anthropic/responses/response-mapper";
import { isAsyncMediaEnabled } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { createAsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import {
  resolveConversationalTurn,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import * as conversationalTurnModule from "../../../src/platform/collaboration/conversational-task-intelligence/conversational-turn-resolver";
import { readClientExecutionSpecHandoff } from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-handoff";
import {
  shouldProactivelyAttachBrandLogo,
} from "../../../src/services/ensure-brand-logo-execution-metadata";
import { runEvaluationPlane } from "../../../src/platform/os/evaluation/evaluation-plane";
import {
  beginExecutionTrace,
  recordProductionEvidenceTrace,
  resetExecutionTracesForTests,
} from "../../../src/platform/os/observability/execution-trace";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import type { ProviderAdapterRequest } from "../../../src/platform/providers/adapters/contracts/adapter-io";
import type { HydratedArtifact } from "../../../src/platform/os/evaluation/artifact-evaluation/types";

const TASKMINT_BRIEF =
  "Create a responsive SaaS landing page for TaskMint. Include hero, dashboard preview, three benefits, integrations, two testimonials, pricing teaser and FAQ. Use modern typography, generous whitespace and subtle mint gradients. Include a working Start Free CTA.";

const TASKMINT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>TaskMint</title></head>
<body>
  <header><nav><a href="#start">Start Free</a></nav></header>
  <main>
    <h1>TaskMint</h1>
    <p>Modern SaaS task management with mint gradients and generous whitespace.</p>
    <section id="hero"><button>Start Free</button></section>
    <section id="dashboard-preview"><h2>Dashboard preview</h2></section>
    <section id="benefits"><h2>Benefits</h2><ul><li>Fast</li><li>Simple</li><li>Reliable</li></ul></section>
    <section id="integrations"><h2>Integrations</h2></section>
    <section id="testimonials"><h2>Testimonials</h2></section>
    <section id="pricing"><h2>Pricing teaser</h2></section>
    <section id="faq"><h2>FAQ</h2></section>
  </main>
</body>
</html>`;

function taskMintWebProject() {
  return {
    title: "TaskMint Landing",
    summary: "Responsive SaaS landing page for TaskMint.",
    stack: "html-static",
    brandName: "TaskMint",
    tagline: "Mint your tasks",
    heroBody: "Modern task management for teams.",
    sections: [
      { heading: "Benefits", body: "Fast, simple, reliable." },
      { heading: "Integrations", body: "Connect your stack." },
    ],
    ctaLabel: "Start Free",
    colors: {
      primary: "#2dd4bf",
      background: "#ffffff",
      text: "#0f172a",
      accent: "#99f6e4",
    },
    html: TASKMINT_HTML,
  };
}

function userMsg(text: string): ServiceAiMessageRecord {
  return {
    id: `u-${text.slice(0, 16)}`,
    conversationId: "conv_taskmint",
    channelId: "service_web",
    role: "user",
    text,
    createdAt: "2026-09-02T10:00:00.000Z",
    clientMessageId: `user-${text.slice(0, 16)}`,
    dedupeKey: `user-${text.slice(0, 16)}`,
  };
}

function createTestAsyncMedia() {
  const artifactsRepo = new InMemoryArtifactRepository();
  return createAsyncMediaPlatform({
    env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
    forceInMemory: true,
    artifactsRepo,
    nowIso: () => "2026-09-02T10:00:00.000Z",
    clockMs: () => 1_756_800_000_000,
  });
}

describe("Priority 4.9.1 — website materialization", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
    resetExecutionTracesForTests();
    jest.clearAllMocks();
  });

  it("enables async media when durable LIVE runtime is configured", () => {
    expect(
      isAsyncMediaEnabled({
        ENTERPRISE_API_DURABLE_MODE: "true",
        ENTERPRISE_API_EXECUTION_MODE: "live",
        NODE_ENV: "production",
      }),
    ).toBe(true);
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("successful website provider response creates a persisted HTML artifact", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_taskmint",
      organizationId: "org_taskmint",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebProject" },
        websiteUserBrief: TASKMINT_BRIEF,
        brandName: "TaskMint",
      },
      createId: (p) => `${p}_491`,
      jobSummary: { structuredData: taskMintWebProject() },
    });
    expect(exported.exported).toBe(true);
    expect(exported.artifactIds?.length).toBeGreaterThan(0);
    const htmlId = (exported.result.data as { htmlArtifactId?: string })
      .htmlArtifactId;
    expect(htmlId).toBeTruthy();
    expect(exported.artifactIds).toContain(htmlId);
  });

  it("artifactId is continuous across materialization and execution extras", async () => {
    const asyncMedia = createTestAsyncMedia();
    const executionId = "exec_continuity";
    const materialized = await materializeWebsiteExport({
      asyncMedia,
      executionId,
      organizationId: "org_cont",
      metadata: {
        websiteUserBrief: TASKMINT_BRIEF,
        brandName: "TaskMint",
      },
      createId: (p) => `${p}_cont`,
      jobSummary: { structuredData: taskMintWebProject() },
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const htmlArtifactId = materialized.value.htmlArtifactId;
    expect(htmlArtifactId).toBeTruthy();
    expect(materialized.value.artifactIds).toContain(htmlArtifactId);
    expect(materialized.value.plan.htmlArtifactId).toBe(htmlArtifactId);
  });

  it("failed materialization remains failure — no fabricated artifact IDs", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_bad",
      organizationId: "org_bad",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebProject" },
      },
      createId: (p) => `${p}_bad`,
      jobSummary: {
        structuredData: {
          title: "Not a website",
          summary: "Missing required website fields",
        },
      },
    });
    expect(exported.exported).toBe(false);
    expect(exported.artifactIds).toBeUndefined();
    expect(exported.errorCode).toBe("WEBSITE_MATERIALIZATION_FAILURE");
  });

  it("website-required export still fails when asyncMedia is explicitly absent", async () => {
    const exported = await applyWebsiteExportToExecution({
      asyncMedia: undefined,
      executionId: "exec_no_media",
      organizationId: "org_no_media",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebProject" },
      },
      createId: (p) => `${p}_nm`,
      jobSummary: { structuredData: taskMintWebProject() },
    });
    expect(exported.exported).toBe(false);
    expect(exported.errorCode).toMatch(/async media/i);
  });

  it("maps Anthropic WebsiteRoutes tool_use into structured output", () => {
    const request = {
      requestId: "req_web",
      providerId: "provider.anthropic",
      adapterId: "anthropic.messages",
      modelId: "claude-sonnet-4-5",
      capabilityId: "text.generate",
      streaming: false,
    } as ProviderAdapterRequest;
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          {
            type: "tool_use",
            id: "tool_1",
            name: "WebsiteRoutes",
            input: {
              routes: [taskMintWebProject()],
            },
          },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      },
      request,
      100,
      "2026-09-02T10:00:00.000Z",
    );
    expect(mapped.output.structured).toBeDefined();
    expect(
      (mapped.output.structured as { routes?: unknown[] }).routes?.length,
    ).toBe(1);
  });

  it("browser evaluation plane runs when persisted website artifact exists", async () => {
    const htmlArtifactId = "art_taskmint_html";
    const hydrate = async (): Promise<readonly HydratedArtifact[]> =>
      Object.freeze([
        Object.freeze({
          artifactId: htmlArtifactId,
          mimeType: "text/html",
          byteSize: Buffer.byteLength(TASKMINT_HTML),
          bytes: Buffer.from(TASKMINT_HTML),
          kind: "html" as const,
          textContent: TASKMINT_HTML,
        }),
      ]);

    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_eval",
      organizationId: "org_eval",
      outputKind: "deferred_website",
      mediaArtifactIds: [htmlArtifactId],
      hydrateArtifacts: hydrate,
      runRuntimeCheck: async () =>
        Object.freeze({
          evaluated: true,
          status: "COMPLETED",
          startupSucceeded: true,
          runtimeErrors: Object.freeze([]),
          consoleErrors: Object.freeze([]),
          failedResourceLoads: Object.freeze([]),
          confidence: "measured",
          evidence: Object.freeze(["mock"]),
          performanceReadings: Object.freeze([]),
          desktop: Object.freeze({
            name: "desktop",
            width: 1280,
            height: 800,
            renderSuccess: true,
            documentWidth: 1200,
            documentHeight: 900,
            horizontalOverflow: false,
            evidence: Object.freeze(["ok"]),
          }),
          mobile: Object.freeze({
            name: "mobile",
            width: 390,
            height: 844,
            renderSuccess: true,
            documentWidth: 390,
            documentHeight: 900,
            horizontalOverflow: false,
            evidence: Object.freeze(["ok"]),
          }),
        }),
    });
    expect(planeResult.stageTrace?.runtimeEvaluation).not.toBe("SKIPPED");
    expect(planeResult.stageTrace?.runtimeEvaluationReason ?? "").not.toMatch(
      /no_media_artifact_ids/i,
    );
  });
});

describe("Priority 4.9.1 — brand vault logo", () => {
  it("proactively attaches logo for website service jobs", () => {
    expect(
      shouldProactivelyAttachBrandLogo({
        metadata: { service: "website" },
        brief: TASKMINT_BRIEF,
        capabilityId: "text.generate",
      }),
    ).toBe(true);
  });
});

describe("Priority 4.9.1 — conversation turn deduplication", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("buildExecutionContextFromConversation reuses precomputed turn without re-resolving", () => {
    const state: ServiceAiConversationState = {
      service: "website",
      brandId: "brand_taskmint",
      productPath: "website/landing",
    };
    const messages = [userMsg(TASKMINT_BRIEF)];
    const turn = resolveConversationalTurn({
      conversationId: "conv_taskmint",
      channelId: "service_web",
      latestUserMessage: TASKMINT_BRIEF,
      messages,
      state,
      nowIso: () => "2026-09-02T10:00:00.000Z",
    });
    const spy = jest.spyOn(conversationalTurnModule, "resolveConversationalTurn");
    const ctx = buildExecutionContextFromConversation({
      conversationId: "conv_taskmint",
      channelId: "service_web",
      messages,
      state: { ...state, taskIntelligence: turn.updatedTaskState },
      latestUserMessage: TASKMINT_BRIEF,
      turn,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(ctx.conversationalAction).toBe(turn.action);
    expect(ctx.executionSpec?.executionInstruction).toBe(
      turn.executionSpec?.executionInstruction,
    );
    spy.mockRestore();
  });

  it("client executionSpecHandoff is readable for prepass skip", () => {
    const turn = resolveConversationalTurn({
      conversationId: "conv_taskmint",
      channelId: "service_web",
      latestUserMessage: TASKMINT_BRIEF,
      messages: [userMsg(TASKMINT_BRIEF)],
      state: {
        service: "website",
        brandId: "brand_taskmint",
        productPath: "website/landing",
      },
      nowIso: () => "2026-09-02T10:00:00.000Z",
    });
    const handoff = readClientExecutionSpecHandoff({
      executionSpecHandoff: turn.executionSpec,
      conversationalEffectiveInstruction: turn.effectiveInstruction,
    });
    expect(handoff?.executionInstruction).toContain("TaskMint");
  });
});

describe("Priority 4.9.1 — TaskMint production-equivalent E2E (deterministic mocks)", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
    resetExecutionTracesForTests();
  });

  it("CREATE → materialize → evaluate → evidence without artifact-missing state", async () => {
    const state: ServiceAiConversationState = {
      service: "website",
      brandId: "brand_taskmint",
      productPath: "website/landing",
    };
    const messages = [userMsg(TASKMINT_BRIEF)];
    const turn = resolveConversationalTurn({
      conversationId: "conv_taskmint",
      channelId: "service_web",
      latestUserMessage: TASKMINT_BRIEF,
      messages,
      state,
      nowIso: () => "2026-09-02T10:00:00.000Z",
    });

    expect(turn.action).toBe("CREATE");
    expect(turn.requiresExecution).toBe(true);
    expect(turn.executionSpec?.executionInstruction).toMatch(/TaskMint/i);
    expect(turn.executionSpec?.deliverables.length).toBeGreaterThan(0);

    const asyncMedia = createTestAsyncMedia();
    const executionId = "exec_taskmint_e2e";
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId,
      organizationId: "org_taskmint_e2e",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TASKMINT_BRIEF,
        brandName: "TaskMint",
        conversationalAction: turn.action,
        conversationalEffectiveInstruction: turn.effectiveInstruction,
      },
      createId: (p) => `${p}_e2e`,
      jobSummary: {
        structuredData: { routes: [taskMintWebProject()] },
        providerId: "provider.anthropic",
        modelId: "claude-sonnet-4-5",
      },
      runtimeOutput: {
        structured: { routes: [taskMintWebProject()] },
      },
    });

    expect(exported.exported).toBe(true);
    const htmlArtifactId = (exported.result.data as { htmlArtifactId?: string })
      .htmlArtifactId;
    expect(htmlArtifactId).toBeTruthy();
    expect(exported.artifactIds).toContain(htmlArtifactId);

    beginExecutionTrace({
      requestId: "req_taskmint_e2e",
      executionId,
      correlationId: "corr_taskmint_e2e",
      outputKind: "deferred_website",
      service: "website",
    });

    const { planeResult } = await runEvaluationPlane({
      executionId,
      organizationId: "org_taskmint_e2e",
      outputKind: "deferred_website",
      mediaArtifactIds: exported.artifactIds ?? [],
      hydrateArtifacts: async () =>
        Object.freeze([
          Object.freeze({
            artifactId: htmlArtifactId!,
            mimeType: "text/html",
            byteSize: Buffer.byteLength(TASKMINT_HTML),
            bytes: Buffer.from(TASKMINT_HTML),
            kind: "html" as const,
            textContent: TASKMINT_HTML,
          }),
        ]),
      runRuntimeCheck: async () =>
        Object.freeze({
          evaluated: true,
          status: "COMPLETED",
          startupSucceeded: true,
          runtimeErrors: Object.freeze([]),
          consoleErrors: Object.freeze([]),
          failedResourceLoads: Object.freeze([]),
          confidence: "measured",
          evidence: Object.freeze(["taskmint runtime ok"]),
          performanceReadings: Object.freeze([]),
          desktop: Object.freeze({
            name: "desktop",
            width: 1280,
            height: 800,
            renderSuccess: true,
            documentWidth: 1200,
            documentHeight: 900,
            horizontalOverflow: false,
            evidence: Object.freeze(["ok"]),
          }),
          mobile: Object.freeze({
            name: "mobile",
            width: 390,
            height: 844,
            renderSuccess: true,
            documentWidth: 390,
            documentHeight: 900,
            horizontalOverflow: false,
            evidence: Object.freeze(["ok"]),
          }),
        }),
    });

    expect(planeResult.stageTrace?.runtimeEvaluation).toBe("COMPLETED");
    expect(planeResult.stageTrace?.runtimeEvaluationReason ?? "").not.toMatch(
      /no_media_artifact_ids/i,
    );

    recordProductionEvidenceTrace({
      executionId,
      providerSuccess: true,
      evidenceRecorded: true,
      stageTrace: {
        artifactHydration: "COMPLETED",
        hydratedArtifactCount: exported.artifactIds?.length ?? 0,
        artifactRender: "COMPLETED",
        runtimeEvaluation: planeResult.stageTrace?.runtimeEvaluation ?? "COMPLETED",
        evaluationPlane: "COMPLETED",
      },
    });
  });
});
