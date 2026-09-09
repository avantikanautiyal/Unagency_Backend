/**
 * Priority 4.9.4 — Full website execution lifecycle forensic fixes.
 */

import {
  applyWebsiteExportToExecution,
  materializeWebsiteExport,
  WEBSITE_BRIEF_RELEVANCE_ERROR,
  WEBSITE_MATERIALIZATION_FAILURE_ERROR,
} from "../../../src/platform/api/services/website-export-materializer";
import {
  executionSpecSuppliedFromMetadata,
  resolveWebsiteMaterializationBrief,
  resolveWebsiteMaterializationBrand,
  websiteMaterializationUserMessage,
} from "../../../src/platform/api/services/website-materialization-diagnostics";
import { createAsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { InMemoryArtifactRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import {
  resolveConversationalTurn,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import {
  readClientExecutionSpecHandoff,
  readInheritedExecutionSpec,
} from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-handoff";
import {
  executionSpecObservabilitySummary,
  readExecutionSpecSnapshot,
  stampExecutionSpecMetadata,
} from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-snapshot";
import {
  ensureBrandLogoInExecutionMetadata,
} from "../../../src/services/ensure-brand-logo-execution-metadata";
import {
  explicitWebStackFromPrompt,
  recoverWebsiteRoutesPlan,
  validateWebsitePageRelevance,
} from "../../../src/platform/os/delivery/website-generation";
import { runEvaluationPlane } from "../../../src/platform/os/evaluation/evaluation-plane";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";

const TERRALOOP_BRIEF =
  "Brand: TerraLoop\nCreate a responsive landing page for recyclable packaging with premium modern B2B aesthetic, typography, circular-economy messaging, product/service sections, three benefits, industries served, testimonials, FAQ, Get Started CTA, warm neutral tones, restrained green accent.\nOutput: HTML file";

const TASKMINT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>TerraLoop</title></head>
<body>
  <header><nav><a href="#start">Get Started</a></nav></header>
  <main>
    <h1>TerraLoop</h1>
    <p>Premium recyclable packaging for the circular economy.</p>
    <section id="hero"><button>Get Started</button></section>
  </main>
</body>
</html>`;

function terraloopPrimaryFill() {
  return {
    title: "TerraLoop Landing",
    summary: "Premium B2B recyclable packaging landing page.",
    stack: "html-static",
    brandName: "TerraLoop",
    tagline: "Circular economy packaging",
    heroBody: "Premium modern B2B packaging solutions.",
    sections: [{ heading: "Benefits", body: "Sustainable, premium, scalable." }],
    ctaLabel: "Get Started",
    colors: {
      primary: "#4a7c59",
      background: "#f5f0e8",
      text: "#1a1a1a",
      accent: "#6b9080",
    },
    html: TASKMINT_HTML,
  };
}

function terraloopVariantWithoutBrand(index: number) {
  return {
    title: `Creative Direction ${index}`,
    summary: "Alternative layout exploring whitespace and typography.",
    stack: "html-static",
    brandName: "Direction",
    tagline: "Modern layout study",
    heroBody: "Exploring visual hierarchy.",
    sections: [{ heading: "Approach", body: "Minimal and refined." }],
    ctaLabel: "Learn More",
    colors: {
      primary: "#4a7c59",
      background: "#f5f0e8",
      text: "#1a1a1a",
      accent: "#6b9080",
    },
    html: `<!DOCTYPE html><html><head><title>Direction ${index}</title></head><body><h1>Direction ${index}</h1></body></html>`,
  };
}

function userMsg(text: string): ServiceAiMessageRecord {
  return {
    id: `u-${text.slice(0, 16)}`,
    conversationId: "conv_terraloop",
    channelId: "service_web",
    role: "user",
    text,
    createdAt: "2026-09-03T10:00:00.000Z",
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
    nowIso: () => "2026-09-03T10:00:00.000Z",
    clockMs: () => 1_756_900_000_000,
  });
}

describe("Priority 4.9.4 — primary route relevance (LIVE root cause)", () => {
  it("3 WebsiteRoutes materialize when primary is grounded even if alternates omit brand", async () => {
    const asyncMedia = createTestAsyncMedia();
    const routes = [
      terraloopPrimaryFill(),
      terraloopVariantWithoutBrand(2),
      terraloopVariantWithoutBrand(3),
    ];
    const exported = await materializeWebsiteExport({
      asyncMedia,
      executionId: "exec_15_1788373695629",
      organizationId: "org_terraloop",
      createId: (p) => `${p}_494`,
      jobSummary: { structuredData: { routes } },
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TERRALOOP_BRIEF,
        brandName: "TerraLoop",
        executionSpecSnapshot: {
          snapshotId: "snap494",
          executionId: "exec_15_1788373695629",
          snapshotAt: "2026-09-03T10:00:00.000Z",
          planeVersion: "P4.6.1",
          spec: {
            planeVersion: "P4.6.1",
            executionInstruction: TERRALOOP_BRIEF,
            resolutionState: "RESOLVED",
            deliverables: [{ format: "HTML", required: true, provenance: { explicit: true } }],
            outputIntent: { mode: { value: "FINAL", provenance: { explicit: true } } },
            task: { action: { value: "CREATE" } },
            content: {},
            creative: {},
            technical: {},
          },
        },
      },
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.htmlArtifactId).toBeTruthy();
    expect(exported.value.artifactIds.length).toBeGreaterThan(0);
  });

  it("genuinely irrelevant primary route is still rejected", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await materializeWebsiteExport({
      asyncMedia,
      executionId: "exec_irrelevant494",
      organizationId: "org_terraloop",
      createId: (p) => `${p}_494`,
      jobSummary: {
        structuredData: {
          routes: [
            {
              title: "Generic Marketplace",
              summary: "Buy and sell locally",
              stack: "html-static",
              brandName: "Market",
              tagline: "Shop",
              heroBody: "Marketplace",
              sections: [{ heading: "Listings", body: "Items" }],
              ctaLabel: "Browse",
              html: `<!DOCTYPE html><html><head><title>Craigslist</title></head><body><h1>Craigslist</h1></body></html>`,
            },
          ],
        },
      },
      metadata: {
        service: "website",
        websiteUserBrief: TERRALOOP_BRIEF,
        brandName: "TerraLoop",
      },
    });
    expect(exported.ok).toBe(false);
    if (exported.ok) return;
    expect(exported.error.message).toMatch(/not grounded/i);
  });
});

describe("Priority 4.9.4 — canonical brief and executionSpec resolution", () => {
  it("resolveWebsiteMaterializationBrief prefers executionSpec over missing websiteUserBrief", () => {
    const turn = resolveConversationalTurn({
      conversationId: "conv_terraloop",
      channelId: "service_web",
      latestUserMessage: TERRALOOP_BRIEF,
      messages: [userMsg(TERRALOOP_BRIEF)],
      state: {
        service: "website",
        brandId: "brand_terraloop",
        productPath: "website/landing",
      },
      nowIso: () => "2026-09-03T10:00:00.000Z",
    });
    const metadata = stampExecutionSpecMetadata(
      { service: "website", outputKind: "deferred_website" },
      {
        executionId: "exec_15",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T10:00:00.000Z",
        createId: (p) => `${p}_494`,
      },
    );
    const resolved = resolveWebsiteMaterializationBrief({ metadata });
    expect(resolved.source).toBe("executionSpec");
    expect(resolved.brief).toMatch(/TerraLoop/i);
    expect(executionSpecSuppliedFromMetadata(metadata)).toBe(true);
    expect(
      executionSpecObservabilitySummary(readExecutionSpecSnapshot(metadata)?.spec)
        .executionSpecAvailable,
    ).toBe(true);
  });

  it("resolveWebsiteMaterializationBrand extracts TerraLoop from Brand: line", () => {
    const brand = resolveWebsiteMaterializationBrand({
      brief: TERRALOOP_BRIEF,
      metadata: {},
    });
    expect(brand.brandName).toBe("TerraLoop");
    expect(brand.source).toBe("brief");
  });

  it("Output: HTML file resolves to html-static", () => {
    expect(explicitWebStackFromPrompt(TERRALOOP_BRIEF)).toBe("html-static");
  });
});

describe("Priority 4.9.4 — materialization lifecycle and artifacts", () => {
  it("WebsiteRoutes is not itself a persisted artifact", async () => {
    const asyncMedia = createTestAsyncMedia();
    const routes = recoverWebsiteRoutesPlan({
      routes: [terraloopPrimaryFill()],
    });
    expect(routes?.length).toBe(1);
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_routes494",
      organizationId: "org_terraloop",
      status: "succeeded",
      path: "worker",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TERRALOOP_BRIEF,
      },
      createId: (p) => `${p}_494`,
      jobSummary: { structuredData: { routes: [terraloopPrimaryFill()] } },
      currentResult: { kind: "structured", data: { routes: [terraloopPrimaryFill()] } },
      currentArtifactIds: [],
    });
    expect(exported.exported).toBe(true);
    expect(exported.artifactIds?.length).toBeGreaterThan(0);
    expect(exported.result.kind).toBe("structured");
    expect(
      (exported.result.data as { htmlArtifactId?: string }).htmlArtifactId,
    ).toBeTruthy();
  });

  it("failed materialization never fabricates artifact IDs", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_bad494",
      organizationId: "org_terraloop",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        websiteUserBrief: TERRALOOP_BRIEF,
      },
      createId: (p) => `${p}_bad494`,
      jobSummary: { structuredData: { title: "Not a website" } },
      currentArtifactIds: [],
    });
    expect(exported.exported).toBe(false);
    expect(exported.artifactIds ?? []).toHaveLength(0);
    expect(exported.errorCode).toBe(WEBSITE_MATERIALIZATION_FAILURE_ERROR);
  });

  it("poll hydrate without structured output does not fail materialization", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_pollawait494",
      organizationId: "org_terraloop",
      status: "running",
      path: "poll_hydrate",
      executionKind: "idempotent_replay",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        websiteUserBrief: TERRALOOP_BRIEF,
        preferredStack: "html-static",
      },
      createId: (p) => `${p}_pollawait494`,
      jobSummary: {},
      currentArtifactIds: [],
    });
    expect(exported.exported).toBe(false);
    expect(exported.errorCode).toBeUndefined();
    expect(exported.artifactIds ?? []).toHaveLength(0);
  });

  it("settled materialization failure is not re-attempted on poll", async () => {
    const asyncMedia = createTestAsyncMedia();
    const first = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_settled494",
      organizationId: "org_terraloop",
      status: "succeeded",
      path: "worker",
      metadata: { service: "website", websiteUserBrief: TERRALOOP_BRIEF },
      createId: (p) => `${p}_494`,
      jobSummary: {
        structuredData: { routes: [terraloopVariantWithoutBrand(1)] },
        websiteMaterializationErrorCode: WEBSITE_BRIEF_RELEVANCE_ERROR,
        websiteMaterializationSettled: true,
      },
      currentArtifactIds: [],
    });
    expect(first.exported).toBe(false);

    const second = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_settled494",
      organizationId: "org_terraloop",
      status: "succeeded",
      path: "poll_hydrate",
      executionKind: "idempotent_replay",
      metadata: { service: "website", websiteUserBrief: TERRALOOP_BRIEF },
      createId: (p) => `${p}_494b`,
      jobSummary: {
        structuredData: { routes: [terraloopVariantWithoutBrand(1)] },
        websiteMaterializationErrorCode: WEBSITE_BRIEF_RELEVANCE_ERROR,
        websiteMaterializationSettled: true,
      },
      currentArtifactIds: [],
    });
    expect(second.exported).toBe(false);
    expect(second.errorCode).toBe(WEBSITE_BRIEF_RELEVANCE_ERROR);
  });
});

describe("Priority 4.9.4 — optional logo, retry, evaluation, frontend taxonomy", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("missing optional logo does not block website CREATE", async () => {
    const result = await ensureBrandLogoInExecutionMetadata({
      organizationId: "org_no_logo494",
      brandId: "brand_no_logo494",
      metadata: { service: "website" },
      brief: TERRALOOP_BRIEF,
      capabilityId: "text.generate",
    });
    expect(result.logoAvailable).toBe(false);
  });

  it("retry inherits executionSpec from parentExecutionId", async () => {
    const turn = resolveConversationalTurn({
      conversationId: "conv_terraloop",
      channelId: "service_web",
      latestUserMessage: TERRALOOP_BRIEF,
      messages: [userMsg(TERRALOOP_BRIEF)],
      state: {
        service: "website",
        brandId: "brand_terraloop",
        productPath: "website/landing",
      },
      nowIso: () => "2026-09-03T10:00:00.000Z",
    });
    const parentMetadata = stampExecutionSpecMetadata(
      { service: "website", websiteUserBrief: TERRALOOP_BRIEF },
      {
        executionId: "exec_15",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T10:00:00.000Z",
        createId: (p) => `${p}_parent494`,
      },
    );
    const inherited = await readInheritedExecutionSpec({
      host: {
        loadExecution: async (id) =>
          id === "exec_15" ? { metadata: parentMetadata } : undefined,
      },
      metadata: { parentExecutionId: "exec_15" },
    });
    expect(inherited?.executionInstruction).toMatch(/TerraLoop/i);
    const handoff = readClientExecutionSpecHandoff({
      executionSpecHandoff: inherited,
    });
    expect(handoff?.executionInstruction).toMatch(/TerraLoop/i);
  });

  it("Evaluation Plane skips without artifact IDs and runs with real IDs", async () => {
    const asyncMedia = createTestAsyncMedia();
    const materialized = await materializeWebsiteExport({
      asyncMedia,
      executionId: "exec_plane494",
      organizationId: "org_terraloop",
      createId: (p) => `${p}_plane494`,
      jobSummary: { structuredData: { routes: [terraloopPrimaryFill()] } },
      metadata: {
        service: "website",
        websiteUserBrief: TERRALOOP_BRIEF,
      },
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;

    const skipped = await runEvaluationPlane({
      executionId: "exec_plane494",
      organizationId: "org_terraloop",
      outputKind: "deferred_website",
      mediaArtifactIds: [],
      hydrateArtifacts: async () => Object.freeze([]),
      runRuntimeCheck: async () =>
        Object.freeze({
          evaluated: false,
          status: "SKIPPED",
          startupSucceeded: false,
          runtimeErrors: Object.freeze([]),
          consoleErrors: Object.freeze([]),
          failedResourceLoads: Object.freeze([]),
          confidence: "none",
          evidence: Object.freeze([]),
          performanceReadings: Object.freeze([]),
          desktop: Object.freeze({
            name: "desktop",
            width: 1280,
            height: 800,
            renderSuccess: false,
            documentWidth: 0,
            documentHeight: 0,
            horizontalOverflow: false,
            evidence: Object.freeze([]),
          }),
          mobile: Object.freeze({
            name: "mobile",
            width: 390,
            height: 844,
            renderSuccess: false,
            documentWidth: 0,
            documentHeight: 0,
            horizontalOverflow: false,
            evidence: Object.freeze([]),
          }),
        }),
    });
    expect(skipped.planeResult.stageTrace?.runtimeEvaluation).toBe("SKIPPED");

    const htmlArtifactId = materialized.value.htmlArtifactId!;

    const withIds = await runEvaluationPlane({
      executionId: "exec_plane494",
      organizationId: "org_terraloop",
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
          confidence: "high",
          evidence: Object.freeze([]),
          performanceReadings: Object.freeze([]),
          desktop: Object.freeze({
            name: "desktop",
            width: 1280,
            height: 800,
            renderSuccess: true,
            documentWidth: 1280,
            documentHeight: 900,
            horizontalOverflow: false,
            evidence: Object.freeze([]),
          }),
          mobile: Object.freeze({
            name: "mobile",
            width: 390,
            height: 844,
            renderSuccess: true,
            documentWidth: 390,
            documentHeight: 1200,
            horizontalOverflow: false,
            evidence: Object.freeze([]),
          }),
        }),
    });
    expect(withIds.planeResult.stageTrace?.runtimeEvaluation).toBe("COMPLETED");
  });

  it("frontend/backend error taxonomy distinguishes relevance vs materialization", () => {
    expect(websiteMaterializationUserMessage(WEBSITE_BRIEF_RELEVANCE_ERROR)).toMatch(
      /not grounded/i,
    );
    expect(
      websiteMaterializationUserMessage(WEBSITE_MATERIALIZATION_FAILURE_ERROR),
    ).not.toMatch(/not grounded/i);
    expect(
      websiteMaterializationUserMessage(WEBSITE_MATERIALIZATION_FAILURE_ERROR),
    ).toMatch(/preview file/i);
  });

  it("validateWebsitePageRelevance uses description in blob when present on route", () => {
    const result = validateWebsitePageRelevance({
      userBrief: TERRALOOP_BRIEF,
      brandName: "TerraLoop",
      data: {
        title: "TerraLoop Landing",
        summary: "Recyclable packaging",
        description: "TerraLoop circular economy packaging for B2B",
        stack: "html-static",
        brandName: "TerraLoop",
        tagline: "Circular packaging",
        heroBody: "Premium B2B packaging.",
        sections: [{ heading: "Benefits", body: "Sustainable." }],
        ctaLabel: "Get Started",
        html: TASKMINT_HTML,
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe("Priority 4.9.4 — production-equivalent integration path", () => {
  it("resolveTurn → executionSpec → WebsiteRoutes → HTML artifact", async () => {
    const turn = resolveConversationalTurn({
      conversationId: "conv_terraloop",
      channelId: "service_web",
      latestUserMessage: TERRALOOP_BRIEF,
      messages: [userMsg(TERRALOOP_BRIEF)],
      state: {
        service: "website",
        brandId: "brand_terraloop",
        productPath: "website/landing",
      },
      nowIso: () => "2026-09-03T10:00:00.000Z",
    });
    expect(turn.executionSpec).toBeDefined();
    expect(turn.executionSpec!.executionInstruction).toMatch(/TerraLoop/i);

    const metadata = stampExecutionSpecMetadata(
      {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TERRALOOP_BRIEF,
        brandName: "TerraLoop",
        conversationalEffectiveInstruction: turn.effectiveInstruction,
      },
      {
        executionId: "exec_15_1788373695629",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T10:00:00.000Z",
        createId: (p) => `${p}_e2e494`,
      },
    );

    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_15_1788373695629",
      organizationId: "org_terraloop",
      status: "succeeded",
      path: "dispatch_sync",
      executionKind: "fresh",
      metadata,
      createId: (p) => `${p}_e2e494`,
      jobSummary: {
        structuredData: {
          routes: [
            terraloopPrimaryFill(),
            terraloopVariantWithoutBrand(2),
            terraloopVariantWithoutBrand(3),
          ],
        },
        providerId: "provider.anthropic",
        modelId: "claude-sonnet-4-5",
      },
      currentResult: {
        kind: "structured",
        data: { routes: [terraloopPrimaryFill()] },
      },
      currentArtifactIds: [],
    });

    expect(exported.exported).toBe(true);
    expect(exported.artifactIds?.length).toBeGreaterThan(0);
    expect(executionSpecSuppliedFromMetadata(metadata)).toBe(true);
  });
});
