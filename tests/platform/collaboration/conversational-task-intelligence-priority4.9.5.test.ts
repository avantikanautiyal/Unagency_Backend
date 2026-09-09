/**
 * Priority 4.9.5 — Production-path integrity audit (zero paid API calls).
 * Exercises ExecutionApiService.create/retry at the public service boundary.
 */

import { failure, success } from "../../../src/platform/core/result";
import { ProviderError } from "../../../src/platform/core/errors";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { createEnterpriseApiPlatform } from "../../../src/platform/api/factories/create-enterprise-api-platform";
import { loginDemo } from "../../../src/platform/api/testing";
import {
  getSharedTestDurableStores,
  resetSharedTestDurableStores,
  createAsyncMediaPlatform,
} from "../../../src/platform/infrastructure/durability";
import { InMemoryArtifactRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import { asJobId } from "../../../src/platform/infrastructure/execution/contracts/job";
import {
  applyWebsiteExportToExecution,
  WEBSITE_BRIEF_RELEVANCE_ERROR,
} from "../../../src/platform/api/services/website-export-materializer";
import {
  buildContinuationCreateRequest,
  pickRetryableCreateMetadata,
} from "../../../src/platform/api/services/execution-retry-handoff";
import {
  resolveParentExecutionIdFromContinuationMetadata,
  readInheritedExecutionSpec,
} from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-handoff";
import {
  readExecutionSpecSnapshot,
  stampExecutionSpecMetadata,
  executionSpecObservabilitySummary,
} from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-snapshot";
import {
  resolveExecutionSpecProvenance,
  executionSpecProvenanceObservability,
} from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-provenance";
import {
  resolveConversationalTurn,
  resetRequirementCounterForTests,
  resetThreadCounterForTests,
} from "../../../src/platform/collaboration/conversational-task-intelligence";
import { buildExecutionContextFromConversation } from "../../../src/platform/collaboration/service-conversation-context";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import type {
  ServiceAiConversationState,
  ServiceAiMessageRecord,
} from "../../../src/platform/collaboration/service-conversation-types";
import type { ExecutionResource } from "../../../src/platform/api/contracts";

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
    <section id="testimonials"><h2>Testimonials</h2></section>
  </main>
</body>
</html>`;

function terraloopPrimaryRoute() {
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

function terraloopWebsiteRoutesPayload() {
  return {
    routes: [
      terraloopPrimaryRoute(),
      {
        title: "Creative Direction 2",
        summary: "Alternative layout.",
        stack: "html-static",
        brandName: "Direction",
        tagline: "Modern layout study",
        heroBody: "Exploring visual hierarchy.",
        sections: [{ heading: "Approach", body: "Minimal." }],
        ctaLabel: "Learn More",
        html: `<!DOCTYPE html><html><head><title>Direction 2</title></head><body><h1>Direction 2</h1></body></html>`,
      },
      {
        title: "Creative Direction 3",
        summary: "Whitespace study.",
        stack: "html-static",
        brandName: "Direction",
        tagline: "Typography focus",
        heroBody: "Refined hierarchy.",
        sections: [{ heading: "Approach", body: "Airy." }],
        ctaLabel: "Learn More",
        html: `<!DOCTYPE html><html><head><title>Direction 3</title></head><body><h1>Direction 3</h1></body></html>`,
      },
    ],
  };
}

function structuredSchemaName(request: ProviderExecutionRequest): string {
  const rf = request.payload?.response_format as
    | { type?: string; json_schema?: { name?: string } }
    | undefined;
  return String(rf?.json_schema?.name ?? "").toLowerCase();
}

class WebsiteRoutesFixtureDispatcher extends ControllableDispatcher {
  async dispatch(
    request: ProviderExecutionRequest,
    token: CancellationToken,
  ): Promise<import("../../../src/platform/core/result").Result<ProviderExecutionResponse>> {
    const schemaName = structuredSchemaName(request);
    if (
      schemaName === "websiteroutes" ||
      schemaName === "webproject" ||
      schemaName === "websitepage"
    ) {
      if (this.mode === "fail") {
        return failure(new ProviderError("dispatch failed", { requestId: request.requestId }));
      }
      const body = JSON.stringify(terraloopWebsiteRoutesPayload());
      return success({
        requestId: request.requestId,
        providerId: request.providerId,
        output: {
          content: body,
          text: body,
          message: body,
          finishReason: "stop",
        },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        providerRequestId: `ctrl_${request.requestId}`,
        streamed: false,
        finishedAt: new Date().toISOString(),
      });
    }
    return super.dispatch(request, token);
  }
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

function assistantRoutes(executionId: string): ServiceAiMessageRecord {
  return {
    id: `ai-${executionId}`,
    conversationId: "conv_terraloop",
    channelId: "service_web",
    role: "assistant",
    text: "Here are your routes",
    createdAt: "2026-09-03T10:01:00.000Z",
    clientMessageId: `routes-${executionId}`,
    dedupeKey: `routes-${executionId}`,
    executionId,
    artifactId: `art_${executionId}`,
    routes: [
      { id: "r1", label: "Route 1", title: "Bold" },
      { id: "r2", label: "Route 2", title: "Premium" },
      { id: "r3", label: "Route 3", title: "Minimal" },
    ],
  };
}

function baseConversationState(): ServiceAiConversationState {
  return {
    service: "website",
    subtype: "landing-pages",
    brandId: "brand_terraloop",
    productPath: "website/landing",
    activeExecutionId: "exec_parent495",
    activeArtifactId: "art_parent495",
    selectedRouteId: "r2",
  };
}

function resolveInitialWebsiteCreate() {
  return resolveConversationalTurn({
    conversationId: "conv_terraloop",
    channelId: "service_web",
    latestUserMessage: TERRALOOP_BRIEF,
    messages: [userMsg(TERRALOOP_BRIEF)],
    state: {
      service: "website",
      subtype: "landing-pages",
      brandId: "brand_terraloop",
      productPath: "website/landing",
    },
    nowIso: () => "2026-09-03T10:00:00.000Z",
  });
}

function resolveWebsiteTurn(latestUserMessage: string, input?: {
  messages?: ServiceAiMessageRecord[];
  state?: ServiceAiConversationState;
}) {
  return resolveConversationalTurn({
    conversationId: "conv_terraloop",
    channelId: "service_web",
    latestUserMessage,
    messages: input?.messages ?? [
      userMsg(TERRALOOP_BRIEF),
      assistantRoutes("exec_parent495"),
    ],
    state: input?.state ?? baseConversationState(),
    nowIso: () => "2026-09-03T10:00:00.000Z",
  });
}

function frontendEquivalentWebsiteCreate(turn: ReturnType<typeof resolveWebsiteTurn>, organizationId: string) {
  return {
    prompt: turn.effectiveInstruction,
    organizationId,
    capabilityId: "text.generate",
    metadata: {
      service: "website",
      subtype: "landing-pages",
      outputKind: "deferred_website",
      structuredOutput: { name: "WebsiteRoutes" },
      executionSpecHandoff: turn.executionSpec,
      websiteUserBrief: turn.executionSpec?.executionInstruction ?? TERRALOOP_BRIEF,
      brandId: "brand_terraloop",
      brandName: "TerraLoop",
      channelId: "service_web",
      conversationId: "conv_terraloop",
      conversationalEffectiveInstruction: turn.effectiveInstruction,
      conversationalAction: turn.action,
    },
    structuredOutput: {
      name: "WebsiteRoutes",
      schema: { type: "object", properties: { routes: { type: "array" } } },
    },
  };
}

function createProductionEquivalentPlatform() {
  const artifactsRepo = new InMemoryArtifactRepository();
  const asyncMedia = createAsyncMediaPlatform({
    env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
    forceInMemory: true,
    artifactsRepo,
    nowIso: () => "2026-09-03T10:00:00.000Z",
    clockMs: () => 1_756_900_000_000,
  });
  const stores = getSharedTestDurableStores();
  return createEnterpriseApiPlatform({
    executionMode: "simulated",
    durableStores: { ...stores, asyncMedia },
    runtimeDispatcher: new WebsiteRoutesFixtureDispatcher(),
    seedDemoTenant: true,
    nowIso: () => "2026-09-03T10:00:00.000Z",
    clockMs: () => 1_756_900_000_000,
  });
}

function tenantFrom(platform: ReturnType<typeof createProductionEquivalentPlatform>, organizationId: string) {
  return {
    principalId: platform.seed!.userId,
    kind: "user" as const,
    userId: platform.seed!.userId,
    organizationId,
    workspaceId: platform.seed!.workspaceId,
    roles: ["owner" as const],
  };
}

describe("Priority 4.9.5 — continuation / inheritance primitives", () => {
  it("retriedFrom resolves as parentExecutionId for inheritance", () => {
    expect(
      resolveParentExecutionIdFromContinuationMetadata({
        retriedFrom: "exec_parent495",
      }),
    ).toBe("exec_parent495");
    expect(
      resolveParentExecutionIdFromContinuationMetadata({
        parentExecutionId: "exec_parent495",
      }),
    ).toBe("exec_parent495");
    expect(
      resolveParentExecutionIdFromContinuationMetadata({
        duplicatedFrom: "exec_parent495",
      }),
    ).toBe("exec_parent495");
  });

  it("buildContinuationCreateRequest preserves executionSpec and website task metadata", () => {
    const turn = resolveInitialWebsiteCreate();
    const parentMetadata = stampExecutionSpecMetadata(
      {
        service: "website",
        subtype: "landing-pages",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
        websiteUserBrief: TERRALOOP_BRIEF,
        channelId: "service_web",
        conversationId: "conv_terraloop",
      },
      {
        executionId: "exec_parent495",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T10:00:00.000Z",
        createId: (p) => `${p}_495`,
      },
    );
    const parent: ExecutionResource = {
      executionId: "exec_parent495",
      status: "failed",
      organizationId: "org_terraloop",
      correlationId: "corr_parent495",
      createdAt: "2026-09-03T10:00:00.000Z",
      updatedAt: "2026-09-03T10:00:00.000Z",
      promptPreview: TERRALOOP_BRIEF.slice(0, 120),
      capabilityId: "text.generate",
      brandId: "brand_terraloop",
      channelId: "service_web",
      conversationId: "conv_terraloop",
    };
    const req = buildContinuationCreateRequest({
      parentExecution: parent,
      parentCreateMetadata: parentMetadata,
      organizationId: "org_terraloop",
      reason: "retry",
    });
    expect(req.metadata?.retriedFrom).toBe("exec_parent495");
    expect(req.metadata?.parentExecutionId).toBe("exec_parent495");
    expect(req.metadata?.service).toBe("website");
    expect(req.metadata?.subtype).toBe("landing-pages");
    expect(req.metadata?.outputKind).toBe("deferred_website");
    expect(req.metadata?.websiteUserBrief).toMatch(/TerraLoop/i);
    expect(readExecutionSpecSnapshot(req.metadata)?.spec.executionInstruction).toMatch(
      /TerraLoop/i,
    );
  });

  it("pickRetryableCreateMetadata captures executionSpecSnapshot for extras persistence", () => {
    const turn = resolveInitialWebsiteCreate();
    const stamped = stampExecutionSpecMetadata(
      { service: "website", websiteUserBrief: TERRALOOP_BRIEF },
      {
        executionId: "exec_snap495",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T10:00:00.000Z",
        createId: (p) => `${p}_495`,
      },
    );
    const picked = pickRetryableCreateMetadata(stamped);
    expect(picked.executionSpecSnapshot).toBeDefined();
    expect(picked.websiteUserBrief).toMatch(/TerraLoop/i);
    expect(picked.service).toBe("website");
  });

  it("executionSpec provenance diagnostics omit raw prompts", () => {
    const turn = resolveInitialWebsiteCreate();
    const obs = executionSpecProvenanceObservability({
      metadata: { executionSpecHandoff: turn.executionSpec },
      conversationSpec: turn.executionSpec,
    });
    expect(obs.executionSpecSource).toBe("conversational_resolution");
    expect(obs.executionSpecSnapshotPresent).toBe(false);
    expect(obs.executionSpecHandoffPresent).toBe(true);
    expect(JSON.stringify(obs)).not.toContain(TERRALOOP_BRIEF.slice(0, 40));
  });

  it("readInheritedExecutionSpec loads parent createMetadataSnapshot via retriedFrom", async () => {
    const turn = resolveInitialWebsiteCreate();
    const parentCreateMetadata = stampExecutionSpecMetadata(
      {
        service: "website",
        outputKind: "deferred_website",
        websiteUserBrief: TERRALOOP_BRIEF,
      },
      {
        executionId: "exec_parent495",
        spec: turn.executionSpec!,
        nowIso: () => "2026-09-03T10:00:00.000Z",
        createId: (p) => `${p}_495`,
      },
    );
    const inherited = await readInheritedExecutionSpec({
      host: {
        loadExecution: async () => ({ metadata: undefined }),
        loadExecutionCreateMetadata: async (id) =>
          id === "exec_parent495" ? parentCreateMetadata : undefined,
      },
      metadata: { retriedFrom: "exec_parent495" },
    });
    expect(inherited?.executionInstruction).toMatch(/TerraLoop/i);
    expect(
      resolveExecutionSpecProvenance({
        metadata: { executionSpecSnapshot: readExecutionSpecSnapshot(parentCreateMetadata) },
        inheritedFromParent: true,
      }).source,
    ).toBe("inherited_parent");
  });
});

describe("Priority 4.9.5 — ExecutionApiService production-equivalent API path", () => {
  afterEach(() => {
    resetSharedTestDurableStores();
  });

  it("frontend-equivalent website CREATE reaches execution with executionSpec", async () => {
    const platform = createProductionEquivalentPlatform();
    const { organizationId } = await loginDemo(platform);
    const turn = resolveInitialWebsiteCreate();
    const created = await platform.executions.create(
      frontendEquivalentWebsiteCreate(turn, organizationId),
      tenantFrom(platform, organizationId),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const extras = await platform.durableStores!.extras.get(created.value.executionId);
    const snapshot = readExecutionSpecSnapshot(
      (extras as { createMetadataSnapshot?: Record<string, unknown> } | undefined)
        ?.createMetadataSnapshot ??
        (extras as { executionSpecSnapshot?: unknown } | undefined),
    );
    expect(snapshot?.spec.executionInstruction).toMatch(/TerraLoop/i);
    expect(executionSpecObservabilitySummary(snapshot?.spec).executionSpecAvailable).toBe(
      true,
    );
  }, 120_000);

  it("executionSpec survives distributed enqueue in job payload metadata", async () => {
    const platform = createProductionEquivalentPlatform();
    const { organizationId } = await loginDemo(platform);
    const turn = resolveInitialWebsiteCreate();
    const created = await platform.executions.create(
      frontendEquivalentWebsiteCreate(turn, organizationId),
      tenantFrom(platform, organizationId),
    );
    expect(created.ok).toBe(true);
    if (!created.ok || !created.value.jobId) return;

    const job = platform.distributed.getJob(asJobId(String(created.value.jobId)));
    expect(job.ok).toBe(true);
    if (!job.ok || !job.value) return;

    const jobMeta = job.value.payload.metadata ?? {};
    expect(jobMeta.service).toBe("website");
    expect(jobMeta.outputKind).toBe("deferred_website");
    expect(readExecutionSpecSnapshot(jobMeta)?.spec.executionInstruction).toMatch(/TerraLoop/i);
    expect(jobMeta.websiteUserBrief).toMatch(/TerraLoop/i);
  }, 120_000);

  it("worker materializes WebsiteRoutes into persisted HTML artifact", async () => {
    const platform = createProductionEquivalentPlatform();
    const { organizationId } = await loginDemo(platform);
    const turn = resolveInitialWebsiteCreate();
    const created = await platform.executions.create(
      frontendEquivalentWebsiteCreate(turn, organizationId),
      tenantFrom(platform, organizationId),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.status).toBe("succeeded");
    expect(created.value.artifactIds?.length).toBeGreaterThan(0);
    const htmlArtifactId = (created.value.result?.data as { htmlArtifactId?: string })
      ?.htmlArtifactId;
    expect(htmlArtifactId).toBeTruthy();
    expect(created.value.artifactIds).toContain(htmlArtifactId);
  }, 120_000);

  it("retry preserves original execution specification through production path", async () => {
    const platform = createProductionEquivalentPlatform();
    const { organizationId } = await loginDemo(platform);
    const turn = resolveInitialWebsiteCreate();
    const parent = await platform.executions.create(
      frontendEquivalentWebsiteCreate(turn, organizationId),
      tenantFrom(platform, organizationId),
    );
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const parentExtras = await platform.durableStores!.extras.get(parent.value.executionId);
    expect(
      (parentExtras as { createMetadataSnapshot?: Record<string, unknown> } | undefined)
        ?.createMetadataSnapshot,
    ).toBeDefined();

    const retried = await platform.executions.retry(
      parent.value.executionId,
      tenantFrom(platform, organizationId),
    );
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;

    const childExtras = await platform.durableStores!.extras.get(retried.value.executionId);
    const childSnapshot = readExecutionSpecSnapshot(
      (childExtras as { createMetadataSnapshot?: Record<string, unknown> } | undefined)
        ?.createMetadataSnapshot ??
        (childExtras as { executionSpecSnapshot?: unknown } | undefined),
    );
    expect(childSnapshot?.spec.executionInstruction).toMatch(/TerraLoop/i);

    if (retried.value.jobId) {
      const job = platform.distributed.getJob(asJobId(String(retried.value.jobId)));
      if (job.ok && job.value?.payload.metadata) {
        expect(job.value.payload.metadata.service).toBe("website");
        expect(job.value.payload.metadata.outputKind).toBe("deferred_website");
        expect(readExecutionSpecSnapshot(job.value.payload.metadata)).toBeDefined();
      }
    }
  }, 120_000);

  it("retry preserves websiteUserBrief service subtype and outputKind", async () => {
    const platform = createProductionEquivalentPlatform();
    const { organizationId } = await loginDemo(platform);
    const turn = resolveInitialWebsiteCreate();
    const parent = await platform.executions.create(
      frontendEquivalentWebsiteCreate(turn, organizationId),
      tenantFrom(platform, organizationId),
    );
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const retried = await platform.executions.retry(
      parent.value.executionId,
      tenantFrom(platform, organizationId),
    );
    expect(retried.ok).toBe(true);
    if (!retried.ok || !retried.value.jobId) return;

    const job = platform.distributed.getJob(asJobId(String(retried.value.jobId)));
    expect(job.ok).toBe(true);
    if (!job.ok || !job.value) return;
    const meta = job.value.payload.metadata ?? {};
    expect(meta.service).toBe("website");
    expect(meta.subtype).toBe("landing-pages");
    expect(meta.outputKind).toBe("deferred_website");
    expect(String(meta.websiteUserBrief)).toMatch(/TerraLoop/i);
  }, 120_000);

  it("duplicate poll hydrate does not create duplicate artifacts", async () => {
    const platform = createProductionEquivalentPlatform();
    const { organizationId } = await loginDemo(platform);
    const turn = resolveInitialWebsiteCreate();
    const created = await platform.executions.create(
      frontendEquivalentWebsiteCreate(turn, organizationId),
      tenantFrom(platform, organizationId),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const artifactIds = [...(created.value.artifactIds ?? [])];
    expect(artifactIds.length).toBeGreaterThan(0);

    const job = created.value.jobId
      ? platform.distributed.getJob(asJobId(String(created.value.jobId)))
      : undefined;
    const summary =
      job?.ok && job.value?.resultSummary ? job.value.resultSummary : {};

    const replay = await applyWebsiteExportToExecution({
      asyncMedia: platform.durableStores!.asyncMedia,
      executionId: created.value.executionId,
      organizationId,
      status: "succeeded",
      path: "poll_hydrate",
      executionKind: "idempotent_replay",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        websiteUserBrief: TERRALOOP_BRIEF,
      },
      createId: (p) => `${p}_495poll`,
      jobSummary: summary,
      currentArtifactIds: artifactIds,
    });
    expect(replay.exported).toBe(true);
    expect(replay.artifactIds).toEqual(artifactIds);
  }, 120_000);

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});

describe("Priority 4.9.5 — conversational chat continuity (P4.5 task intelligence)", () => {
  beforeEach(() => {
    resetRequirementCounterForTests();
    resetThreadCounterForTests();
  });

  it("generate another version resolves as REGENERATE/VARIATE with task context", () => {
    const turn = resolveWebsiteTurn("Try again with a different direction");
    expect(["REGENERATE", "VARIATE"]).toContain(turn.action);
    expect(turn.requiresExecution).toBe(true);
    expect(turn.reference?.executionId).toBe("exec_parent495");
  });

  it("remove testimonials resolves as REMOVE preserving other requirements", () => {
    const turn = resolveWebsiteTurn("Remove the testimonials section");
    expect(turn.action).toBe("REMOVE");
    expect(turn.reference?.executionId).toBe("exec_parent495");
  });

  it("I don't like this does not auto-execute", () => {
    const turn = resolveWebsiteTurn("I don't like this");
    expect(turn.requiresExecution).toBe(false);
    expect(turn.action).toBe("REJECT");
  });

  it("informational question does not execute", () => {
    const turn = resolveWebsiteTurn("Why did you choose this direction?");
    expect(turn.requiresExecution).toBe(false);
    expect(turn.action).toBe("EXPLAIN");
  });

  it("use the second version resolves artifact reference", () => {
    const turn = resolveWebsiteTurn("Use the second route");
    expect(turn.reference?.routeIndex).toBe(2);
    expect(turn.reference?.routeId).toBe("r2");
  });

  it("buildExecutionContextFromConversation wraps resolveConversationalTurn (live chat path)", async () => {
    const ctx = await buildExecutionContextFromConversation({
      channelId: "service_web",
      latestUserMessage: TERRALOOP_BRIEF,
      messages: [userMsg(TERRALOOP_BRIEF)],
      state: baseConversationState(),
      nowIso: () => "2026-09-03T10:00:00.000Z",
    });
    expect(ctx.executionSpec).toBeDefined();
    expect(ctx.executionSpec!.executionInstruction).toMatch(/TerraLoop/i);
    expect(ctx.effectiveInstruction).toBeTruthy();
  });

  it("approval phrase executes pending proposal when present", () => {
    const first = resolveWebsiteTurn("Make the headline stronger");
    expect(first.requiresExecution).toBe(true);
    expect(first.action).toBe("MODIFY");
    const state = {
      ...baseConversationState(),
      taskIntelligence: {
        ...first.updatedTaskState,
        pendingProposal: {
          action: "MODIFY",
          summary: "Strengthen headline",
          proposedAt: "2026-09-03T10:00:00.000Z",
        },
      },
    };
    const second = resolveWebsiteTurn("Go ahead", {
      messages: [
        userMsg(TERRALOOP_BRIEF),
        assistantRoutes("exec_parent495"),
        userMsg("Make the headline stronger"),
      ],
      state,
    });
    expect(second.requiresExecution).toBe(true);
    expect(second.action).toBe("APPROVE");
  });
});

describe("Priority 4.9.5 — materialization failure integrity", () => {
  it("settled materialization failure is not re-attempted on poll", async () => {
    const artifactsRepo = new InMemoryArtifactRepository();
    const asyncMedia = createAsyncMediaPlatform({
      env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
      forceInMemory: true,
      artifactsRepo,
      nowIso: () => "2026-09-03T10:00:00.000Z",
      clockMs: () => 1_756_900_000_000,
    });
    const first = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_settled495",
      organizationId: "org_terraloop",
      status: "succeeded",
      path: "worker",
      metadata: { service: "website", websiteUserBrief: TERRALOOP_BRIEF },
      createId: (p) => `${p}_495`,
      jobSummary: {
        structuredData: { routes: [terraloopPrimaryRoute()] },
        websiteMaterializationErrorCode: WEBSITE_BRIEF_RELEVANCE_ERROR,
        websiteMaterializationSettled: true,
      },
      currentArtifactIds: [],
    });
    expect(first.exported).toBe(false);
    expect(first.artifactIds ?? []).toHaveLength(0);

    const second = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_settled495",
      organizationId: "org_terraloop",
      status: "succeeded",
      path: "poll_hydrate",
      executionKind: "idempotent_replay",
      metadata: { service: "website", websiteUserBrief: TERRALOOP_BRIEF },
      createId: (p) => `${p}_495b`,
      jobSummary: {
        structuredData: { routes: [terraloopPrimaryRoute()] },
        websiteMaterializationErrorCode: WEBSITE_BRIEF_RELEVANCE_ERROR,
        websiteMaterializationSettled: true,
      },
      currentArtifactIds: [],
    });
    expect(second.exported).toBe(false);
    expect(second.artifactIds ?? []).toHaveLength(0);
  });

  it("failed materialization does not fabricate artifact IDs", async () => {
    const artifactsRepo = new InMemoryArtifactRepository();
    const asyncMedia = createAsyncMediaPlatform({
      env: { ENTERPRISE_API_EXECUTION_MODE: "simulated" },
      forceInMemory: true,
      artifactsRepo,
    });
    const exported = await applyWebsiteExportToExecution({
      asyncMedia,
      executionId: "exec_nofabricate495",
      organizationId: "org_terraloop",
      status: "succeeded",
      metadata: {
        service: "website",
        outputKind: "deferred_website",
        structuredOutput: { name: "WebsiteRoutes" },
      },
      createId: (p) => `${p}_495`,
      jobSummary: {
        structuredData: { title: "Not a website", summary: "Missing fields" },
      },
      currentArtifactIds: [],
    });
    expect(exported.exported).toBe(false);
    expect(exported.artifactIds).toBeUndefined();
  });
});
