/**
 * Priority 4.9.2 — Optional input resilience, website materialization hardening, structural cleanup.
 */

import {
  applyWebsiteExportToExecution,
  materializeWebsiteExport,
} from "../../../src/platform/api/services/website-export-materializer";
import { buildExecutionResultPayload } from "../../../src/platform/api/services/execution-result-payload";
import { mapAnthropicResponseToCanonical } from "../../../src/platform/providers/anthropic/responses/response-mapper";
import { createAsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import {
  resolveConversationalTurn,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import * as conversationalTurnModule from "../../../src/platform/collaboration/conversational-task-intelligence/conversational-turn-resolver";
import {
  classifyExecutionInputRequirement,
  filterBlockingMissingBrandSlots,
} from "../../../src/platform/execution/execution-input-policy";
import {
  ensureBrandLogoInExecutionMetadata,
} from "../../../src/services/ensure-brand-logo-execution-metadata";
import {
  explicitPreferredStackFromMetadata,
  recoverWebsiteRoutesPlan,
  recoverWebProjectPlan,
} from "../../../src/platform/os/delivery/website-generation";
import { runEvaluationPlane } from "../../../src/platform/os/evaluation/evaluation-plane";
import {
  beginExecutionTrace,
  finalizeExecutionTrace,
  recordWebsiteMaterializationTrace,
  resetExecutionTracesForTests,
} from "../../../src/platform/os/observability/execution-trace";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import type { ProviderAdapterRequest } from "../../../src/platform/providers/adapters/contracts/adapter-io";

const TASKMINT_BRIEF =
  "Create a premium SaaS landing page for TaskMint. Include a hero, dashboard preview, three benefits, integrations, two testimonials, pricing teaser and FAQ. Use modern typography, generous whitespace and subtle mint gradients. Include a working Start Free CTA. Output: HTML.";

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

function taskMintFill() {
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

describe("Priority 4.9.2 — execution input policy", () => {
  it("brand logo is OPTIONAL for website generation by default", () => {
    expect(
      classifyExecutionInputRequirement({
        kind: "brand_logo",
        service: "website",
        brief: TASKMINT_BRIEF,
      }),
    ).toBe("OPTIONAL");
  });

  it("brand logo is REQUIRED when reuse_canonical role is set", () => {
    expect(
      classifyExecutionInputRequirement({
        kind: "brand_logo",
        metadata: { logoRole: "reuse_canonical" },
        brief: TASKMINT_BRIEF,
      }),
    ).toBe("REQUIRED");
  });

  it("missing optional logo does not produce blocking brand slots", () => {
    expect(
      filterBlockingMissingBrandSlots({
        missingSlots: ["logo"],
        service: "website",
        brief: TASKMINT_BRIEF,
      }),
    ).toEqual([]);
  });

  it("explicitly required logo still blocks when reuse role is set", () => {
    expect(
      filterBlockingMissingBrandSlots({
        missingSlots: ["logo"],
        service: "website",
        brief: TASKMINT_BRIEF,
        metadata: { logoRole: "reuse_canonical" },
      }),
    ).toEqual(["logo"]);
  });

  it("html output is REQUIRED for website service", () => {
    expect(
      classifyExecutionInputRequirement({
        kind: "html_output",
        service: "website",
        brief: TASKMINT_BRIEF,
      }),
    ).toBe("REQUIRED");
  });
});

describe("Priority 4.9.2 — website materialization hardening", () => {
  beforeEach(() => {
    resetExecutionTracesForTests();
  });

  it("WebsiteRoutes + html-static materializes persisted HTML artifact", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_routes",
      organizationId: "org_routes",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TASKMINT_BRIEF,
      },
      createId: (p) => `${p}_492`,
      jobSummary: { structuredData: { routes: [taskMintFill()] } },
    });
    expect(exported.exported).toBe(true);
    expect(exported.artifactIds?.length).toBeGreaterThan(0);
    const htmlId = (exported.result.data as { htmlArtifactId?: string })
      .htmlArtifactId;
    expect(htmlId).toBeTruthy();
    expect(exported.artifactIds).toContain(htmlId);
  });

  it("does not treat routes-only result as already exported without artifacts", async () => {
    const asyncMedia = createTestAsyncMedia();
    const routesOnlyResult = buildExecutionResultPayload({
      status: "succeeded",
      jobSummary: { structuredData: { routes: [taskMintFill()] } },
    });
    expect(routesOnlyResult.kind).toBe("structured");

    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_routes_only",
      organizationId: "org_routes_only",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
      },
      createId: (p) => `${p}_492b`,
      jobSummary: { structuredData: { routes: [taskMintFill()] } },
      currentResult: routesOnlyResult,
      currentArtifactIds: [],
    });
    expect(exported.exported).toBe(true);
    expect(exported.artifactIds?.length).toBeGreaterThan(0);
  });

  it("provider-declared html-static is preserved when metadata infers react-vite", () => {
    const routes = recoverWebsiteRoutesPlan(
      { routes: [{ ...taskMintFill(), stack: "html-static" }] },
      { preferredStack: "react-vite" },
    );
    expect(routes?.[0]?.stack).toBe("html-static");
  });

  it("metadata-inferred stack does not override via explicitPreferredStackFromMetadata absence", () => {
    expect(
      explicitPreferredStackFromMetadata({
        service: "website",
        websiteUserBrief: "Build a React Vite app",
      }),
    ).toBeUndefined();
    const project = recoverWebProjectPlan(taskMintFill(), {
      preferredStack: "react-vite",
    });
    expect(project?.stack).toBe("html-static");
  });

  it("materialization failure remains truthful — no fabricated artifact IDs", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_bad492",
      organizationId: "org_bad492",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
      },
      createId: (p) => `${p}_bad492`,
      jobSummary: {
        structuredData: { title: "Not a website", summary: "nope" },
      },
    });
    expect(exported.exported).toBe(false);
    expect(exported.artifactIds).toBeUndefined();
  });

  it("artifactId flows to mediaArtifactIds and Evaluation Plane", async () => {
    const asyncMedia = createTestAsyncMedia();
    const materialized = await materializeWebsiteExport({
      asyncMedia,
      executionId: "exec_plane492",
      organizationId: "org_plane492",
      createId: (p) => `${p}_plane492`,
      jobSummary: { structuredData: taskMintFill() },
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const htmlArtifactId = materialized.value.htmlArtifactId!;
    expect(materialized.value.artifactIds).toContain(htmlArtifactId);

    const { planeResult } = await runEvaluationPlane({
      executionId: "exec_plane492",
      organizationId: "org_plane492",
      outputKind: "deferred_website",
      mediaArtifactIds: materialized.value.artifactIds,
      hydrateArtifacts: async () =>
        Object.freeze([
          Object.freeze({
            artifactId: htmlArtifactId,
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
          evidence: Object.freeze(["ok"]),
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

  it("materialization trace marks FAILED when website required but no artifacts", () => {
    beginExecutionTrace({
      requestId: "req_trace492",
      executionId: "exec_trace492",
      correlationId: "corr_trace492",
      outputKind: "deferred_website",
      service: "website",
    });
    recordWebsiteMaterializationTrace({
      executionId: "exec_trace492",
      exported: true,
      websiteRequired: true,
      artifactIds: [],
    });
    const finalized = finalizeExecutionTrace("exec_trace492");
    expect(finalized?.stages.find((s) => s.stage === "os_materialization")?.status).toBe(
      "FAILED",
    );
    expect(
      finalized?.stages.find((s) => s.stage === "artifact_persistence")?.status,
    ).toBe("FAILED");
  });

  it("maps Anthropic WebsiteRoutes tool_use into structured output", () => {
    const request = {
      requestId: "req_web492",
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
            input: { routes: [taskMintFill()] },
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
      recoverWebsiteRoutesPlan(mapped.output.structured)?.length,
    ).toBeGreaterThan(0);
  });
});

describe("Priority 4.9.2 — brand vault logo optional continuation", () => {
  it("missing logo records logoAvailable=false and continues", async () => {
    const result = await ensureBrandLogoInExecutionMetadata({
      organizationId: "org_no_logo",
      brandId: "brand_no_logo",
      metadata: { service: "website" },
      brief: TASKMINT_BRIEF,
      capabilityId: "text.generate",
    });
    expect(result.logoAvailable).toBe(false);
    expect(result.optionalContextAvailable).toBe(false);
    expect(result.brandLogoAssetId).toBeUndefined();
  });
});

describe("Priority 4.9.2 — conversation turn deduplication", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("one precomputed turn avoids duplicate resolveConversationalTurn", () => {
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
    spy.mockRestore();
  });
});

describe("Priority 4.9.2 — TaskMint live-equivalent (deterministic, no logo)", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
    resetExecutionTracesForTests();
  });

  it("CREATE → WebsiteRoutes → HTML artifact → Evaluation Plane without logo", async () => {
    const state: ServiceAiConversationState = {
      service: "website",
      brandId: "brand_taskmint_no_logo",
      productPath: "website/landing",
    };
    const messages = [userMsg(TASKMINT_BRIEF)];
    const turn = resolveConversationalTurn({
      conversationId: "conv_taskmint_nl",
      channelId: "service_web",
      latestUserMessage: TASKMINT_BRIEF,
      messages,
      state,
      nowIso: () => "2026-09-02T10:00:00.000Z",
    });

    expect(turn.action).toBe("CREATE");
    expect(turn.requiresExecution).toBe(true);

    const logoMeta = await ensureBrandLogoInExecutionMetadata({
      organizationId: "org_taskmint_nl",
      brandId: "brand_taskmint_no_logo",
      metadata: { service: "website", brandId: "brand_taskmint_no_logo" },
      brief: TASKMINT_BRIEF,
      capabilityId: "text.generate",
    });
    expect(logoMeta.logoAvailable).toBe(false);

    const asyncMedia = createTestAsyncMedia();
    const executionId = "exec_taskmint_nl492";
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId,
      organizationId: "org_taskmint_nl",
      status: "succeeded",
      metadata: {
        ...logoMeta,
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TASKMINT_BRIEF,
        brandName: "TaskMint",
      },
      createId: (p) => `${p}_nl492`,
      jobSummary: {
        structuredData: { routes: [taskMintFill()] },
        providerId: "provider.anthropic",
        modelId: "claude-sonnet-4-5",
      },
      runtimeOutput: {
        structured: { routes: [taskMintFill()] },
      },
    });

    expect(exported.exported).toBe(true);
    const htmlArtifactId = (exported.result.data as { htmlArtifactId?: string })
      .htmlArtifactId;
    expect(htmlArtifactId).toBeTruthy();
    expect(exported.artifactIds).toContain(htmlArtifactId);

    const { planeResult } = await runEvaluationPlane({
      executionId,
      organizationId: "org_taskmint_nl",
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
          evidence: Object.freeze(["taskmint no-logo ok"]),
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
    expect(planeResult.stageTrace?.evaluationPlane).not.toBe("SKIPPED");
    expect(planeResult.stageTrace?.runtimeEvaluationReason ?? "").not.toMatch(
      /no_media_artifact_ids/i,
    );
  });
});
