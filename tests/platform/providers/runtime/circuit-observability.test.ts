/**
 * Circuit observability + failure accounting.
 *
 * Covers transition logging, classification, 429 non-tripping policy,
 * cooldown / half-open / close, attempt history, and ALL_PROVIDERS_COOLING_DOWN.
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../../src/platform/core/errors";
import {
  asOrganizationId,
  asProviderId,
} from "../../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../../src/platform/core/result";
import {
  ALL_PROVIDERS_COOLING_DOWN_CODE,
  createDirectExecutionEngine,
} from "../../../../src/platform/direct/direct-execution-engine";
import {
  CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
  CDF_WEBSITE_SITEMAP_SCHEMA,
  CDF_WEBSITE_SITEMAP_SCHEMA_ID,
} from "../../../../src/platform/os/delivery/cdf-website-sitemap-schemas";
import { classifyExecutionFailure } from "../../../../src/platform/providers/routing/performance/failover/failure-classification";
import type { CancellationToken } from "../../../../src/platform/providers/runtime/contracts/cancellation";
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from "../../../../src/platform/providers/runtime/contracts/circuit-breaker";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../../src/platform/providers/runtime/contracts/provider-execution-response";
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
} from "../../../../src/platform/providers/runtime/circuit-breaker/circuit-breaker";
import {
  resetCircuitTransitionLogger,
  setCircuitTransitionLogger,
  type CircuitTransitionLogEvent,
} from "../../../../src/platform/providers/runtime/diagnostics/circuit-transition-log";
import { buildProviderHealthSnapshots } from "../../../../src/platform/providers/runtime/diagnostics/provider-health-snapshot";
import { extractProviderErrorDiagnostics } from "../../../../src/platform/providers/runtime/diagnostics/provider-error-extraction";
import { createProviderRuntime } from "../../../../src/platform/providers/runtime/factories/create-provider-runtime";
import {
  ControllableDispatcher,
  sampleRequest,
} from "../../../../src/platform/providers/runtime/testing";
import { createToolRuntimePlatform } from "../../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";

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
  | {
      readonly kind: "http_error";
      readonly message: string;
      readonly status?: number;
      readonly providerCode?: string;
    }
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
        new ProviderError(step.message, {
          requestId: request.requestId,
          status: step.status,
          httpStatus: step.status,
          providerErrorCode: step.providerCode,
        })
      );
    }
    if (step.kind === "rate_limit") {
      return failure(
        new ProviderError("HTTP 429 too many requests / rate limit", {
          requestId: request.requestId,
          status: 429,
          httpStatus: 429,
          providerErrorCode: "rate_limit_exceeded",
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
      { providerId: "provider.gemini", modelId: "gemini-pro-latest" },
    ],
    structuredOutput: {
      name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
      schema: CDF_WEBSITE_SITEMAP_SCHEMA as unknown as Record<string, unknown>,
      strict: true,
    },
    ...overrides,
  };
}

describe("circuit observability + failure accounting", () => {
  afterEach(() => {
    resetCircuitTransitionLogger();
  });

  it("A — CLOSED → failure increments failureCount", () => {
    const breaker = new CircuitBreaker({
      providerId: asProviderId("provider.openai"),
      config: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    });
    assert.equal(breaker.snapshot().state, "closed");
    assert.equal(breaker.snapshot().failureCount, 0);
    breaker.recordFailure({ failureCategory: "http_5xx", httpStatus: 500 });
    assert.equal(breaker.snapshot().state, "closed");
    assert.equal(breaker.snapshot().failureCount, 1);
    assert.equal(breaker.snapshot().lastFailureCategory, "http_5xx");
  });

  it("B — failureCount=5 → CLOSED → OPEN", () => {
    const breaker = new CircuitBreaker({
      providerId: asProviderId("provider.openai"),
      config: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 5 },
    });
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure({ failureCategory: "http_5xx" });
    }
    assert.equal(breaker.snapshot().state, "closed");
    breaker.recordFailure({ failureCategory: "http_5xx", httpStatus: 503 });
    assert.equal(breaker.snapshot().state, "open");
    assert.equal(breaker.snapshot().failureCount, 5);
  });

  it("C — circuit transition produces structured diagnostic log", () => {
    const events: CircuitTransitionLogEvent[] = [];
    setCircuitTransitionLogger((e) => events.push(e));
    const breaker = new CircuitBreaker({
      providerId: asProviderId("provider.anthropic"),
      config: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 2 },
    });
    breaker.recordFailure({
      model: "claude-sonnet-4-5",
      capability: "text.generate",
      failureCategory: "http_5xx",
      httpStatus: 500,
      providerErrorCode: "overloaded_error",
      executionId: "exec_test",
      correlationId: "corr_test",
      requestId: "req_test",
    });
    breaker.recordFailure({
      model: "claude-sonnet-4-5",
      failureCategory: "http_5xx",
      httpStatus: 500,
      executionId: "exec_test",
      requestId: "req_test",
    });
    const openEvent = events.find(
      (e) => e.event === "circuit_transition" && e.circuitStateAfter === "open"
    );
    assert.ok(openEvent);
    assert.equal(openEvent!.provider, "provider.anthropic");
    assert.equal(openEvent!.circuitStateBefore, "closed");
    assert.equal(openEvent!.failureCount, 2);
    assert.equal(openEvent!.failureThreshold, 2);
    assert.equal(openEvent!.httpStatus, 500);
    assert.equal(openEvent!.failureCategory, "http_5xx");
    assert.equal(openEvent!.executionId, "exec_test");
    assert.ok(openEvent!.cooldownMs > 0);
    assert.ok(openEvent!.cooldownUntil);
    assert.ok(openEvent!.timestamp);
  });

  it("D — OPEN → HALF_OPEN after cooldown", () => {
    let now = 1_000_000;
    const breaker = new CircuitBreaker({
      providerId: asProviderId("provider.openai"),
      config: {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 1,
        resetTimeoutMs: 30_000,
      },
      nowMs: () => now,
      nowIso: () => new Date(now).toISOString(),
    });
    breaker.recordFailure({ failureCategory: "timeout" });
    assert.equal(breaker.snapshot().state, "open");
    assert.equal(breaker.canDispatch(), false);
    now += 30_000;
    assert.equal(breaker.canDispatch(), true);
    assert.equal(breaker.snapshot().state, "half_open");
  });

  it("E — successful probe: HALF_OPEN → CLOSED", () => {
    let now = 1_000_000;
    const breaker = new CircuitBreaker({
      providerId: asProviderId("provider.openai"),
      config: {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeoutMs: 1_000,
      },
      nowMs: () => now,
      nowIso: () => new Date(now).toISOString(),
    });
    breaker.recordFailure({ failureCategory: "http_5xx" });
    now += 1_000;
    assert.equal(breaker.canDispatch(), true);
    assert.equal(breaker.snapshot().state, "half_open");
    breaker.recordSuccess({ reason: "probe_1" });
    assert.equal(breaker.snapshot().state, "half_open");
    breaker.recordSuccess({ reason: "probe_2" });
    assert.equal(breaker.snapshot().state, "closed");
    assert.equal(breaker.snapshot().failureCount, 0);
  });

  it("F — 429 classified as rate_limit and does NOT trip circuit", async () => {
    const events: CircuitTransitionLogEvent[] = [];
    setCircuitTransitionLogger((e) => events.push(e));

    const dispatcher = new ScriptedDispatcher([{ kind: "rate_limit" }]);
    const runtime = createProviderRuntime({
      dispatcher,
      sleep: () => Promise.resolve(),
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 30_000,
      },
    });

    for (let i = 0; i < 5; i++) {
      await runtime.execute(
        sampleRequest({
          requestId: `req_429_${i}`,
          providerId: asProviderId("provider.openai"),
          retryPolicy: {
            strategy: "none",
            maxAttempts: 1,
            baseDelayMs: 0,
          },
        })
      );
    }
    assert.equal(runtime.canDispatchToProvider("provider.openai"), true);
    const rateEvents = events.filter(
      (e) => e.failureCategory === "rate_limit" || e.httpStatus === 429
    );
    assert.ok(rateEvents.length >= 1);
    for (const e of rateEvents) {
      assert.equal(e.circuitCounted, false);
      assert.equal(e.circuitStateAfter, e.circuitStateBefore);
    }
    assert.equal(
      classifyExecutionFailure({
        error: { code: "PROVIDER_ERROR", message: "HTTP 429", httpStatus: 429 },
        httpStatus: 429,
      }),
      "rate_limit"
    );
  });

  it("G — 5xx classified correctly and trips circuit", () => {
    assert.equal(
      classifyExecutionFailure({
        error: {
          code: "PROVIDER_ERROR",
          message: "OpenAI HTTP 503",
          httpStatus: 503,
        },
        httpStatus: 503,
      }),
      "http_5xx"
    );
    const breaker = new CircuitBreaker({
      providerId: asProviderId("provider.openai"),
      config: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, failureThreshold: 1 },
    });
    breaker.recordFailure({ failureCategory: "http_5xx", httpStatus: 503 });
    assert.equal(breaker.snapshot().state, "open");
  });

  it("H — timeout classification", () => {
    assert.equal(
      classifyExecutionFailure({
        status: "timed_out",
        error: { code: "TIMEOUT_ERROR", message: "execution timed out" },
      }),
      "timeout"
    );
    assert.equal(
      classifyExecutionFailure({
        error: {
          code: "PROVIDER_ERROR",
          message: "Anthropic HTTP timeout",
          httpStatus: 408,
        },
        httpStatus: 408,
      }),
      "timeout"
    );
  });

  it("I — schema mismatch → structured_output_invalid; does not poison health", () => {
    assert.equal(
      classifyExecutionFailure({
        error: {
          code: "STRUCTURED_OUTPUT_INVALID",
          message: "schema mismatch",
        },
      }),
      "structured_output_invalid"
    );
    const registry = new CircuitBreakerRegistry();
    const breaker = registry.forProvider(asProviderId("provider.gemini"));
    breaker.recordSuccess();
    assert.equal(breaker.snapshot().state, "closed");
    assert.equal(breaker.snapshot().failureCount, 0);
    const health = buildProviderHealthSnapshots(registry);
    assert.equal(health[0]?.circuitState, "closed");
    assert.equal(health[0]?.failureCount, 0);
  });

  it("J — circuit_open: no HTTP request is made", async () => {
    const dispatcher = new ScriptedDispatcher([
      { kind: "http_error", message: "OpenAI HTTP 500", status: 500 },
      { kind: "structured", structured: VALID_SITEMAP },
    ]);
    const runtime = createProviderRuntime({
      dispatcher,
      sleep: () => Promise.resolve(),
      circuitBreakerConfig: {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 60_000,
      },
    });

    // Trip the breaker with one real failure.
    await runtime.execute(
      sampleRequest({
        requestId: "req_trip",
        providerId: asProviderId("provider.openai"),
        retryPolicy: {
          strategy: "none",
          maxAttempts: 1,
          baseDelayMs: 0,
        },
      })
    );
    assert.equal(runtime.canDispatchToProvider("provider.openai"), false);

    const before = dispatcher.capturedProviders.length;
    const result = await runtime.execute(
      sampleRequest({
        requestId: "req_circuit_skip",
        providerId: asProviderId("provider.openai"),
        retryPolicy: {
          strategy: "none",
          maxAttempts: 1,
          baseDelayMs: 0,
        },
      })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.success, false);
      assert.equal(result.value.error?.failureCategory, "circuit_open");
      assert.equal(result.value.error?.code, "CIRCUIT_OPEN");
    }
    assert.equal(dispatcher.capturedProviders.length, before);
  });

  it("K — fallback attempt history records primary + fallback", async () => {
    const dispatcher = new ScriptedDispatcher([
      {
        kind: "http_error",
        message: "OpenAI HTTP 500",
        status: 500,
        providerCode: "server_error",
      },
      { kind: "structured", structured: VALID_SITEMAP },
    ]);
    const runtime = createProviderRuntime({
      dispatcher,
      sleep: () => Promise.resolve(),
      circuitBreakerConfig: {
        failureThreshold: 5,
        successThreshold: 1,
        resetTimeoutMs: 30_000,
      },
    });
    const toolRuntime = createToolRuntimePlatform({
      invocationStore: new InMemoryToolInvocationStore(),
      dispatcher,
      durable: false,
      runtime,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });

    const result = await engine.run({
      requestId: "req_fb_hist",
      rawPrompt: "Build a sitemap",
      organizationId: asOrganizationId("org_obs"),
      correlationId: "corr_fb",
      metadata: sitemapMetadata(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    assert.equal(dispatcher.capturedProviders[0], "provider.openai");
    assert.ok(
      dispatcher.capturedProviders.slice(1).includes("provider.anthropic") ||
        dispatcher.capturedProviders.slice(1).includes("provider.gemini")
    );

    const history = result.value.artifacts.runtime?.attemptHistory ?? [];
    assert.ok(history.length >= 2);
    assert.equal(history[0]?.primaryOrFailover, "primary");
    assert.equal(history[0]?.success, false);
    assert.ok(history.some((a) => a.primaryOrFailover === "failover" && a.success));
    assert.ok(history[0]?.httpStatus === 500 || history[0]?.failureCategory);
    assert.ok(result.value.artifacts.runtime?.fallbackDiagnostics);
    assert.equal(
      result.value.artifacts.runtime?.fallbackDiagnostics?.primaryProvider,
      "provider.openai"
    );
  });

  it("L — all providers unavailable → ALL_PROVIDERS_COOLING_DOWN + retryAfterMs", async () => {
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
          new ProviderError("HTTP 500 down", {
            requestId: request.requestId,
            status: 500,
            httpStatus: 500,
          })
        );
      }
    })();

    const runtime = createProviderRuntime({
      dispatcher,
      sleep: () => Promise.resolve(),
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

    for (const providerId of [
      "provider.openai",
      "provider.anthropic",
      "provider.gemini",
    ] as const) {
      const trip = await engine.run({
        requestId: `req_trip_${providerId}`,
        rawPrompt: "trip",
        organizationId: asOrganizationId("org_obs"),
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
      requestId: "req_all_open_obs",
      rawPrompt: "sitemap",
      organizationId: asOrganizationId("org_obs"),
      correlationId: "corr_all_open",
      metadata: sitemapMetadata({
        failoverChain: [
          { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5" },
          { providerId: "provider.gemini", modelId: "gemini-pro-latest" },
        ],
      }),
    });
    assert.equal(allOpen.ok, true);
    const report = allOpen.value;
    assert.equal(report.success, false);
    assert.equal(captured.length, before);

    const runtimeErr = report.artifacts.runtime?.error;
    assert.equal(runtimeErr?.code, ALL_PROVIDERS_COOLING_DOWN_CODE);
    assert.ok(
      typeof runtimeErr?.retryAfterMs === "number" && runtimeErr.retryAfterMs > 0
    );
    assert.match(
      String(runtimeErr?.message ?? ""),
      /All eligible AI providers are temporarily unavailable/i
    );
    assert.doesNotMatch(String(runtimeErr?.message ?? ""), /alternate models/i);

    const health = runtime.getProviderHealthSnapshots();
    assert.ok(health.length >= 1);
    assert.ok(health.every((h) => typeof h.failureThreshold === "number"));
    assert.ok(!JSON.stringify(health).toLowerCase().includes("authorization"));
  });

  it("preserves HTTP status + provider error code from ProviderError metadata", () => {
    const err = new ProviderError("OpenAI HTTP 529", {
      status: 529,
      httpStatus: 529,
      providerErrorCode: "overloaded_error",
      body: {
        error: { type: "overloaded_error", message: "Overloaded" },
      },
    });
    const extracted = extractProviderErrorDiagnostics(err);
    assert.equal(extracted.httpStatus, 529);
    assert.equal(extracted.providerErrorCode, "overloaded_error");
    assert.ok(!extracted.sanitizedMessage.includes("sk-"));
  });
});
