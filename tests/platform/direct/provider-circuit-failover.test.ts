/**
 * Provider circuit + Direct failover integrity.
 *
 * Covers the CdfWebsiteSitemap regression:
 * - CDF website contracts must use vendor-diverse text failover
 * - OPEN circuits are skipped before execute (never selected as active fallback)
 * - STRUCTURED_OUTPUT_INVALID does not open the provider circuit
 * - Rate limits do not open the provider-wide circuit
 * - Cooldown / half-open restores eligibility
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../src/platform/core/errors";
import {
  asCapabilityId,
  asOrganizationId,
  asProviderId,
} from "../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../src/platform/core/result";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import {
  CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
  CDF_WEBSITE_SITEMAP_SCHEMA,
  CDF_WEBSITE_SITEMAP_SCHEMA_ID,
} from "../../../src/platform/os/delivery/cdf-website-sitemap-schemas";
import { classifyExecutionFailure } from "../../../src/platform/providers/routing/performance/failover/failure-classification";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from "../../../src/platform/providers/runtime/contracts/circuit-breaker";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { InMemoryProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";
import {
  ControllableDispatcher,
  sampleRequest,
} from "../../../src/platform/providers/runtime/testing";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import { TextExecutionRouter } from "../../../src/platform/providers/routing/text/text-execution-router";

const VALID_SITEMAP = {
  schemaId: CDF_WEBSITE_SITEMAP_SCHEMA_ID,
  siteHierarchy: [
    { id: "home", label: "Home", path: "/" },
    { id: "about", label: "About", path: "/about" },
  ],
  globalNavigation: [
    { label: "Home", path: "/" },
    { label: "About", path: "/about" },
  ],
  pageCount: 2,
};

type ScriptStep =
  | { readonly kind: "structured"; readonly structured: Record<string, unknown> }
  | { readonly kind: "http_error"; readonly message: string }
  | { readonly kind: "rate_limit" };

class ScriptedDispatcher extends ControllableDispatcher {
  readonly capturedProviders: string[] = [];
  private stepIndex = 0;

  constructor(private readonly steps: readonly ScriptStep[]) {
    super({ mode: "success" });
  }

  override async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    this.capturedProviders.push(String(request.providerId));
    const step = this.steps[this.stepIndex] ?? this.steps[this.steps.length - 1]!;
    this.stepIndex += 1;

    if (step.kind === "http_error") {
      return failure(
        new ProviderError(step.message, { requestId: request.requestId })
      );
    }
    if (step.kind === "rate_limit") {
      return failure(
        new ProviderError("HTTP 429 too many requests / rate limit", {
          requestId: request.requestId,
        })
      );
    }

    const prose = JSON.stringify(step.structured);
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        content: prose,
        text: prose,
        structured: step.structured,
        finishReason: "tool_call",
      },
      usage: { promptTokens: 10, completionTokens: 40, totalTokens: 50 },
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }
}

function sitemapMetadata(overrides?: Record<string, unknown>) {
  return {
    capabilityId: "text.generate",
    productAction: "direct_passthrough",
    directPassthrough: true,
    service: "website",
    subtype: "landing-page",
    outputKind: "text",
    preferredProviderId: "provider.openai",
    preferredModelId: "gpt-5.5",
    failoverChain: [
      { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5" },
      { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6" },
      { providerId: "provider.gemini", modelId: "gemini-pro-latest" },
      { providerId: "provider.deepseek", modelId: "deepseek-reasoner" },
    ],
    structuredOutput: {
      name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
      schema: CDF_WEBSITE_SITEMAP_SCHEMA as unknown as Record<string, unknown>,
      strict: true,
    },
    ...overrides,
  };
}

async function runSitemap(input: {
  readonly steps: readonly ScriptStep[];
  readonly metadata?: Record<string, unknown>;
  readonly circuitBreakerConfig?: Partial<typeof DEFAULT_CIRCUIT_BREAKER_CONFIG>;
  readonly nowMs?: () => number;
}) {
  const dispatcher = new ScriptedDispatcher(input.steps);
  const runtime = createProviderRuntime({
    dispatcher,
    nowMs: input.nowMs,
    circuitBreakerConfig: {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...input.circuitBreakerConfig,
    },
  });
  const toolRuntime = createToolRuntimePlatform({
    dispatcher,
    runtime,
    invocationStore: new InMemoryToolInvocationStore(),
    durable: false,
  });
  const engine = createDirectExecutionEngine({
    runtime,
    toolRuntime,
    clockMs: input.nowMs,
  });

  const result = await engine.run({
    requestId: `req_circuit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rawPrompt: "Generate a sitemap for a landing page.",
    organizationId: asOrganizationId("org_circuit_test"),
    correlationId: `corr_circuit_${Date.now()}`,
    metadata: sitemapMetadata(input.metadata),
  });
  assert.equal(result.ok, true, String((result as { error?: { message?: string } }).error?.message ?? "engine.run failed"));

  return { report: result.value, dispatcher, runtime, engine };
}

describe("provider circuit + CdfWebsiteSitemap failover", () => {
  it("1 — healthy primary → successful sitemap", async () => {
    const { report, dispatcher } = await runSitemap({
      steps: [{ kind: "structured", structured: VALID_SITEMAP }],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders[0], "provider.openai");
    assert.equal(report.artifacts.runtime?.finalProviderId, "provider.openai");
  });

  it("2 — primary HTTP fails → healthy fallback succeeds (vendor-diverse)", async () => {
    const { report, dispatcher } = await runSitemap({
      steps: [
        { kind: "http_error", message: "HTTP 503 provider_internal" },
        { kind: "structured", structured: VALID_SITEMAP },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    assert.equal(dispatcher.capturedProviders[0], "provider.openai");
    assert.equal(dispatcher.capturedProviders[1], "provider.anthropic");
    assert.equal(report.artifacts.runtime?.finalProviderId, "provider.anthropic");
    assert.ok((report.artifacts.runtime?.failoverCount ?? 0) >= 1);
  });

  it("3 — primary circuit OPEN → skipped before execute; fallback succeeds", async () => {
    const captured: string[] = [];
    const dispatcher = new (class extends ControllableDispatcher {
      constructor() {
        super({ mode: "success" });
      }
      override async dispatch(
        request: ProviderExecutionRequest,
        _token: CancellationToken
      ): Promise<Result<ProviderExecutionResponse>> {
        captured.push(String(request.providerId));
        if (String(request.providerId) === "provider.openai") {
          return failure(
            new ProviderError("HTTP 500 openai down", {
              requestId: request.requestId,
            })
          );
        }
        const prose = JSON.stringify(VALID_SITEMAP);
        return success({
          requestId: request.requestId,
          providerId: request.providerId,
          output: {
            content: prose,
            text: prose,
            structured: VALID_SITEMAP,
            finishReason: "tool_call",
          },
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          streamed: false,
          finishedAt: new Date().toISOString(),
        });
      }
    })();

    const runtime = createProviderRuntime({
      dispatcher,
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 30_000,
      },
    });
    const toolRuntime = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });

    const trip = await engine.run({
      requestId: "req_trip",
      rawPrompt: "trip",
      organizationId: asOrganizationId("org_circuit_test"),
      correlationId: "corr_trip",
      metadata: sitemapMetadata({ failoverChain: [] }),
    });
    assert.equal(trip.ok, true);
    assert.equal(runtime.canDispatchToProvider("provider.openai"), false);

    const before = captured.length;
    const afterOpen = await engine.run({
      requestId: "req_after_open",
      rawPrompt: "Generate sitemap",
      organizationId: asOrganizationId("org_circuit_test"),
      correlationId: "corr_after",
      metadata: sitemapMetadata({
        failoverChain: [
          { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6" },
          { providerId: "provider.gemini", modelId: "gemini-pro-latest" },
        ],
      }),
    });
    assert.equal(afterOpen.ok, true);
    const report = afterOpen.value;
    assert.equal(report.success, true);
    const after = captured.slice(before);
    assert.ok(!after.includes("provider.openai"));
    assert.equal(after[0], "provider.anthropic");
    assert.equal(report.artifacts.runtime?.finalProviderId, "provider.anthropic");
    const history = report.artifacts.runtime?.attemptHistory ?? [];
    assert.ok(
      history.some(
        (a) =>
          a.providerId === "provider.openai" &&
          a.failureCategory === "circuit_open" &&
          a.success === false
      )
    );
  });

  it("4+5 — primary and fallback both OPEN → clean failure, no endless loop", async () => {
    const captured: string[] = [];
    const dispatcher = new (class extends ControllableDispatcher {
      constructor() {
        super({ mode: "success" });
      }
      override async dispatch(
        request: ProviderExecutionRequest,
        _token: CancellationToken
      ): Promise<Result<ProviderExecutionResponse>> {
        captured.push(String(request.providerId));
        return failure(
          new ProviderError("HTTP 500 down", { requestId: request.requestId })
        );
      }
    })();

    const runtime = createProviderRuntime({
      dispatcher,
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 60_000,
      },
    });
    const toolRuntime = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });

    for (const providerId of ["provider.openai", "provider.anthropic"] as const) {
      const trip = await engine.run({
        requestId: `req_trip_${providerId}`,
        rawPrompt: "trip",
        organizationId: asOrganizationId("org_circuit_test"),
        correlationId: `corr_trip_${providerId}`,
        metadata: sitemapMetadata({
          preferredProviderId: providerId,
          preferredModelId: "x",
          failoverChain: [],
        }),
      });
      assert.equal(trip.ok, true);
      assert.equal(runtime.canDispatchToProvider(providerId), false);
    }

    const before = captured.length;
    const allOpen = await engine.run({
      requestId: "req_all_open",
      rawPrompt: "sitemap",
      organizationId: asOrganizationId("org_circuit_test"),
      correlationId: "corr_all_open",
      metadata: sitemapMetadata({
        failoverChain: [
          { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6" },
        ],
      }),
    });
    assert.equal(allOpen.ok, true);
    const report = allOpen.value;
    assert.equal(report.success, false);
    assert.equal(captured.length, before);
    const msg = String(
      report.trace.stages.find((s) => s.status === "failed")?.message ?? ""
    );
    assert.match(msg, /cooling down|temporarily/i);
    assert.doesNotMatch(msg, /alternate models automatically/i);
  });

  it("6 — invalid structured output does not open the circuit", async () => {
    const { runtime, report } = await runSitemap({
      circuitBreakerConfig: { failureThreshold: 1, resetTimeoutMs: 30_000 },
      // Explicit empty chain — only primary (website matrix still supplies failover;
      // assert circuit health, not attempt count).
      steps: [{ kind: "structured", structured: { notASitemap: true } }],
    });
    assert.equal(report.success, false);
    // Schema invalid is post-HTTP — openai breaker must stay closed even after
    // website failover also attempts other vendors with the same bad schema.
    assert.equal(runtime.canDispatchToProvider("provider.openai"), true);
    assert.equal(runtime.canDispatchToProvider("provider.anthropic"), true);
    assert.equal(runtime.canDispatchToProvider("provider.gemini"), true);
    const snaps = runtime.getCircuitBreakerSnapshots();
    for (const snap of snaps) {
      assert.equal(snap.state, "closed", String(snap.providerId));
    }
    assert.equal(
      classifyExecutionFailure({
        error: {
          code: "STRUCTURED_OUTPUT_INVALID",
          message: "missing required",
        },
      }),
      "structured_output_invalid"
    );
  });

  it("7 — rate limit does not open provider-wide circuit; failover proceeds", async () => {
    const { runtime, dispatcher, report } = await runSitemap({
      circuitBreakerConfig: { failureThreshold: 1, resetTimeoutMs: 30_000 },
      metadata: {
        failoverChain: [
          { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6" },
        ],
      },
      steps: [
        { kind: "rate_limit" },
        { kind: "structured", structured: VALID_SITEMAP },
      ],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders[0], "provider.openai");
    assert.equal(dispatcher.capturedProviders[1], "provider.anthropic");
    assert.equal(runtime.canDispatchToProvider("provider.openai"), true);
  });

  it("8 — timeout classified correctly", () => {
    assert.equal(
      classifyExecutionFailure({
        status: "timed_out",
        error: { code: "TIMEOUT_ERROR", message: "execution timed out" },
      }),
      "timeout"
    );
  });

  it("9 — provider 5xx classified as unavailable", () => {
    const category = classifyExecutionFailure({
      error: { code: "PROVIDER_ERROR", message: "HTTP 503 unavailable" },
    });
    assert.equal(category, "unavailable");
  });

  it("10+11 — cooldown expires → eligible; before expiry remains excluded", async () => {
    let now = 5_000_000;
    const dispatcher = new (class extends ControllableDispatcher {
      override async dispatch(
        request: ProviderExecutionRequest,
        _token: CancellationToken
      ): Promise<Result<ProviderExecutionResponse>> {
        return failure(
          new ProviderError("HTTP 500", { requestId: request.requestId })
        );
      }
    })();

    const runtime = createProviderRuntime({
      dispatcher,
      nowMs: () => now,
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 30_000,
      },
    });

    await runtime.execute({
      ...sampleRequest({
        requestId: "cooldown_trip",
        providerId: "provider.openai",
      }),
      providerId: asProviderId("provider.openai"),
      capabilityId: asCapabilityId("text.generate"),
    });
    assert.equal(runtime.canDispatchToProvider("provider.openai"), false);

    now += 10_000;
    assert.equal(runtime.canDispatchToProvider("provider.openai"), false);

    now += 25_000;
    assert.equal(runtime.canDispatchToProvider("provider.openai"), true);
  });

  it("12 — shared runtime circuit state is consistent across Direct engines", async () => {
    const dispatcher = new ScriptedDispatcher([
      { kind: "http_error", message: "HTTP 500" },
    ]);
    const runtime = createProviderRuntime({
      dispatcher,
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 60_000,
      },
    });
    const toolA = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const toolB = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    assert.equal(toolA.runtime, runtime);
    assert.equal(toolB.runtime, runtime);

    const shared = await createDirectExecutionEngine({ runtime, toolRuntime: toolA }).run({
      requestId: "shared_a",
      rawPrompt: "x",
      organizationId: asOrganizationId("org_circuit_test"),
      correlationId: "c_a",
      metadata: sitemapMetadata({ failoverChain: [] }),
    });
    assert.equal(shared.ok, true);    assert.equal(runtime.canDispatchToProvider("provider.openai"), false);
    assert.equal(toolB.runtime.canDispatchToProvider("provider.openai"), false);
  });

  it("13 — CdfWebsiteSitemap text router vendor-dedupes failover", () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    for (const id of [
      "provider.openai",
      "provider.anthropic",
      "provider.gemini",
      "provider.deepseek",
    ]) {
      registry.registerExecutable({
        providerId: asProviderId(id),
        dispatcher: new ControllableDispatcher({ mode: "success" }),
        status: "available",
        capabilities: ["text.generate"],
      });
    }
    const router = new TextExecutionRouter(registry);
    const routed = router.resolve({
      prompt: "landing page sitemap",
      capabilityId: "text.generate",
      preferredProviderId: "provider.openai",
      preferredModelId: "gpt-5.5",
      metadata: {
        service: "website",
        subtype: "landing-page",
        textUseCase: "website",
      },
    });
    assert.equal(routed.ok, true);
    if (!routed.ok) return;
    const providers = routed.value.failoverChain.map((s) => s.providerId);
    assert.ok(providers.includes("provider.anthropic"));
    assert.ok(providers.includes("provider.gemini"));
    assert.equal(
      providers.filter((p) => p === "provider.anthropic").length,
      1,
      "must not place two Anthropic models in text failover"
    );
  });

  it("13b — websiteTextFailoverChain reaches Gemini (not stuck on Anthropic×2)", async () => {
    const { report, dispatcher } = await runSitemap({
      steps: [
        { kind: "http_error", message: "HTTP 500 openai" },
        { kind: "http_error", message: "HTTP 500 anthropic" },
        { kind: "structured", structured: VALID_SITEMAP },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.includes("provider.gemini"));
    assert.equal(report.artifacts.runtime?.finalProviderId, "provider.gemini");
  });

  it("14 — attempt history reports failover identity accurately", async () => {
    const { report } = await runSitemap({
      steps: [
        { kind: "http_error", message: "HTTP 503" },
        { kind: "structured", structured: VALID_SITEMAP },
      ],
      metadata: {
        failoverChain: [
          { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6" },
        ],
      },
    });
    assert.equal(report.success, true);
    const runtime = report.artifacts.runtime;
    assert.ok(runtime);
    assert.equal(runtime.finalProviderId, "provider.anthropic");
    assert.ok((runtime.failoverCount ?? 0) >= 1);
    assert.ok((runtime.attemptHistory?.length ?? 0) >= 2);
  });

  it("15 — successful generation reports structuredOutputValid", async () => {
    const { report } = await runSitemap({
      steps: [{ kind: "structured", structured: VALID_SITEMAP }],
    });
    assert.equal(report.success, true);
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    assert.equal(out?.structuredOutputValid, true);
  });
});
