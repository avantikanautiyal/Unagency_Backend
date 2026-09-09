/**
 * Priority 4.9.3 — LIVE website execution forensic fixes.
 */

import {
  applyWebsiteExportToExecution,
  materializeWebsiteExport,
  WEBSITE_BRIEF_RELEVANCE_ERROR,
  WEBSITE_MATERIALIZATION_FAILURE_ERROR,
} from "../../../src/platform/api/services/website-export-materializer";
import { websiteMaterializationUserMessage } from "../../../src/platform/api/services/website-materialization-diagnostics";
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
  explicitPreferredStackFromMetadata,
  explicitWebStackFromPrompt,
  recoverWebsiteRoutesPlan,
} from "../../../src/platform/os/delivery/website-generation";
import { runEvaluationPlane } from "../../../src/platform/os/evaluation/evaluation-plane";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";

const TASKMINT_BRIEF =
  "Create a premium SaaS landing page for TaskMint. Include a hero, dashboard preview, three benefits, integrations, two testimonials, pricing teaser and FAQ. Use modern typography, generous whitespace and subtle mint gradients. Include a working Start Free CTA. Output: HTML file.";

const TASKMINT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>TaskMint</title></head>
<body>
  <header><nav><a href="#start">Start Free</a></nav></header>
  <main>
    <h1>TaskMint</h1>
    <p>Modern SaaS task management with mint gradients and generous whitespace.</p>
    <section id="hero"><button>Start Free</button></section>
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
    sections: [{ heading: "Benefits", body: "Fast, simple, reliable." }],
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

describe("Priority 4.9.3 — LIVE worker-equivalent website materialization", () => {
  it("provider WebsiteRoutes → real HTML artifact on worker path", async () => {
    const asyncMedia = createTestAsyncMedia();
    const executionId = "exec_15_worker493";
    const exported = await materializeWebsiteExport({
      asyncMedia,
      executionId,
      organizationId: "org_live493",
      createId: (p) => `${p}_493`,
      jobSummary: {
        structuredData: { routes: [taskMintFill()] },
        providerId: "provider.anthropic",
        modelId: "claude-sonnet-4-5",
      },
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
      },
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.htmlArtifactId).toBeTruthy();
    expect(exported.value.artifactIds.length).toBeGreaterThan(0);
  });

  it("WebsiteRoutes present without artifacts attempts materialization (not skipped)", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_routes493",
      organizationId: "org_routes493",
      status: "succeeded",
      path: "worker",
      executionKind: "fresh",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
      },
      createId: (p) => `${p}_493`,
      jobSummary: { structuredData: { routes: [taskMintFill()] } },
      currentResult: { kind: "structured", data: { routes: [taskMintFill()] } },
      currentArtifactIds: [],
    });
    expect(exported.exported).toBe(true);
    expect(exported.artifactIds?.length).toBeGreaterThan(0);
  });
});

describe("Priority 4.9.3 — optional logo and stack invariants", () => {
  it("missing optional logo does not block website CREATE continuation", async () => {
    const result = await ensureBrandLogoInExecutionMetadata({
      organizationId: "org_no_logo493",
      brandId: "brand_no_logo493",
      metadata: { service: "website" },
      brief: TASKMINT_BRIEF,
      capabilityId: "text.generate",
    });
    expect(result.logoAvailable).toBe(false);
    expect(result.brandLogoAssetId).toBeUndefined();
  });

  it("provider-declared html-static beats inferred metadata stack", () => {
    const routes = recoverWebsiteRoutesPlan(
      { routes: [{ ...taskMintFill(), stack: "html-static" }] },
      { preferredStack: "react-vite" },
    );
    expect(routes?.[0]?.stack).toBe("html-static");
    expect(
      explicitPreferredStackFromMetadata({
        service: "website",
        websiteUserBrief: "Build a React Vite app",
      }),
    ).toBeUndefined();
  });

  it("Output: HTML file resolves to html-static without stack clarification", () => {
    expect(explicitWebStackFromPrompt(TASKMINT_BRIEF)).toBe("html-static");
    expect(explicitWebStackFromPrompt("Output: HTML file")).toBe("html-static");
  });
});

describe("Priority 4.9.3 — conversational resolution and executionSpec handoff", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("one turn → one resolution when precomputed turn is supplied", () => {
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
    buildExecutionContextFromConversation({
      conversationId: "conv_taskmint",
      channelId: "service_web",
      messages,
      state: { ...state, taskIntelligence: turn.updatedTaskState },
      latestUserMessage: TASKMINT_BRIEF,
      turn,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("executionSpecHandoff alone is readable without conversationalEffectiveInstruction", () => {
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
    });
    expect(handoff?.executionInstruction).toMatch(/TaskMint/i);
  });

  it("retry inherits executionSpec from parentExecutionId", async () => {
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
    const parentMetadata = stampExecutionSpecMetadata(
      { service: "website" },
      {
        executionId: "exec_15",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-02T10:00:00.000Z",
        createId: (p) => `${p}_parent493`,
      },
    );
    const inherited = await readInheritedExecutionSpec({
      host: {
        loadExecution: async (id) =>
          id === "exec_15"
            ? { metadata: parentMetadata }
            : undefined,
      },
      metadata: { parentExecutionId: "exec_15" },
    });
    expect(inherited?.executionInstruction).toMatch(/TaskMint/i);
    const snapshot = executionSpecObservabilitySummary(
      readExecutionSpecSnapshot(
        stampExecutionSpecMetadata(
          { parentExecutionId: "exec_15" },
          {
            executionId: "exec_58",
            spec: inherited!,
            nowIso: () => "2026-09-02T10:00:00.000Z",
            createId: (p) => `${p}_retry493`,
          },
        ),
      )?.spec,
    );
    expect(snapshot.executionSpecAvailable).toBe(true);
  });
});

describe("Priority 4.9.3 — materialization failure surfacing and evaluation plane", () => {
  it("invalid structured output returns WEBSITE_MATERIALIZATION_FAILURE not brief relevance", async () => {
    const asyncMedia = createTestAsyncMedia();
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_bad493",
      organizationId: "org_bad493",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
      },
      createId: (p) => `${p}_bad493`,
      jobSummary: {
        structuredData: { title: "Not a website", summary: "nope" },
      },
    });
    expect(exported.exported).toBe(false);
    expect(exported.errorCode).toBe(WEBSITE_MATERIALIZATION_FAILURE_ERROR);
    expect(websiteMaterializationUserMessage(exported.errorCode)).not.toMatch(
      /not grounded/i,
    );
  });

  it("brief relevance failures use WEBSITE_BRIEF_RELEVANCE code", () => {
    expect(
      websiteMaterializationUserMessage(WEBSITE_BRIEF_RELEVANCE_ERROR),
    ).toMatch(/not grounded/i);
    expect(
      websiteMaterializationUserMessage(WEBSITE_MATERIALIZATION_FAILURE_ERROR),
    ).not.toMatch(/not grounded/i);
  });

  it("Evaluation Plane skips without artifact IDs and runs with real IDs", async () => {
    const skipped = await runEvaluationPlane({
      executionId: "exec_no_art493",
      organizationId: "org_no_art493",
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
    expect(skipped.planeResult.stageTrace?.runtimeEvaluationReason ?? "").not.toBe(
      "",
    );

    const asyncMedia = createTestAsyncMedia();
    const materialized = await materializeWebsiteExport({
      asyncMedia,
      executionId: "exec_plane493",
      organizationId: "org_plane493",
      createId: (p) => `${p}_plane493`,
      jobSummary: { structuredData: taskMintFill() },
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const htmlArtifactId = materialized.value.htmlArtifactId!;

    const ran = await runEvaluationPlane({
      executionId: "exec_plane493",
      organizationId: "org_plane493",
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
    expect(ran.planeResult.stageTrace?.runtimeEvaluationReason ?? "").not.toMatch(
      /no_media_artifact_ids/i,
    );
  });
});
