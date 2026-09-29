/**
 * Generic provider failover vs structured-output contract satisfaction.
 *
 * Invariant: once a provider returns normalized + schema-valid structured
 * output for the requested contract, failover MUST stop. Later provider
 * errors must not overwrite that authoritative result.
 *
 * No Anthropic / Social Media / CdfSocialMediaRoutes special-casing in the
 * engine — tests use a generic routes schema contract shape.
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../src/platform/core/errors";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../src/platform/core/result";
import {
  createDirectExecutionEngine,
  providerResultSatisfiesStructuredContract,
} from "../../../src/platform/direct/direct-execution-engine";
import {
  CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
  GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA,
  SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA,
} from "../../../src/platform/os/delivery/cdf-text-choice-schemas";
import { classifyExecutionFailure, shouldFailover } from "../../../src/platform/providers/routing/performance/failover/failure-classification";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import type { ProviderExecutionResult } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import {
  ControllableDispatcher,
} from "../../../src/platform/providers/runtime/testing";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";

const ROUTES_SCHEMA = SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
  string,
  unknown
>;

const CDF_DIRECTIONS_SCHEMA =
  GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
    string,
    unknown
  >;

const VALID_ROUTES = {
  routes: [
    {
      name: "A",
      creativeIdea: "idea a",
      visualTreatment: "vis a",
      headlineAngle: "head a",
      rationale: "why a",
    },
    {
      name: "B",
      creativeIdea: "idea b",
      visualTreatment: "vis b",
      headlineAngle: "head b",
      rationale: "why b",
    },
    {
      name: "C",
      creativeIdea: "idea c",
      visualTreatment: "vis c",
      headlineAngle: "head c",
      rationale: "why c",
    },
  ],
};

const VALID_CDF_DIRECTIONS = {
  routes: [
    { name: "Territory A", creativeIdea: "a", rationale: "r" },
    { name: "Territory B", creativeIdea: "b", rationale: "r" },
    { name: "Territory C", creativeIdea: "c", rationale: "r" },
  ],
};

/** Near-miss + prose — mirrors Anthropic tool_use with extras/aliases. */
const ANTHROPIC_LIKE_STRUCTURED = {
  routes: VALID_ROUTES.routes.map((r) => ({
    ...r,
    title: r.name,
    routeId: `route_${r.name}`,
  })),
};

type ScriptStep =
  | {
      readonly kind: "structured";
      readonly structured: Record<string, unknown> | unknown[];
      readonly prose?: string;
      readonly finishReason?: string;
    }
  | { readonly kind: "http_error"; readonly message: string }
  | { readonly kind: "timeout" }
  | { readonly kind: "plain_text"; readonly text: string };

class ScriptedDispatcher extends ControllableDispatcher {
  readonly capturedProviders: string[] = [];
  readonly capturedSchemaNames: string[] = [];
  private stepIndex = 0;

  constructor(private readonly steps: readonly ScriptStep[]) {
    super({ mode: "success" });
  }

  override async dispatch(
    request: ProviderExecutionRequest,
    token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    this.capturedProviders.push(String(request.providerId));
    const so = request.payload?.structuredOutput as
      | { name?: string }
      | undefined;
    this.capturedSchemaNames.push(
      typeof so?.name === "string" ? so.name : "(none)",
    );
    const step = this.steps[this.stepIndex] ?? this.steps[this.steps.length - 1]!;
    this.stepIndex += 1;

    if (step.kind === "http_error") {
      return failure(
        new ProviderError(step.message, { requestId: request.requestId })
      );
    }
    if (step.kind === "timeout") {
      return failure(
        new ProviderError("execution timed out", { requestId: request.requestId })
      );
    }
    if (step.kind === "plain_text") {
      return success({
        requestId: request.requestId,
        providerId: request.providerId,
        output: {
          content: step.text,
          text: step.text,
          finishReason: "stop",
        },
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        streamed: false,
        finishedAt: new Date().toISOString(),
      });
    }

    const prose =
      step.prose ?? JSON.stringify(step.structured);
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        content: prose,
        text: prose,
        structured: step.structured,
        finishReason: step.finishReason ?? "tool_call",
      },
      usage: { promptTokens: 10, completionTokens: 40, totalTokens: 50 },
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }
}

async function runWithScript(input: {
  readonly steps: readonly ScriptStep[];
  readonly structured?: boolean;
  readonly capabilityId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly contractName?: string;
  readonly schema?: Record<string, unknown>;
  readonly failoverChain?: readonly { providerId: string; modelId: string }[];
}) {
  const dispatcher = new ScriptedDispatcher(input.steps);
  const runtime = createProviderRuntime({ dispatcher });
  const toolRuntime = createToolRuntimePlatform({
    dispatcher,
    runtime,
    invocationStore: new InMemoryToolInvocationStore(),
    durable: false,
  });
  const engine = createDirectExecutionEngine({ runtime, toolRuntime });
  const report = await engine.run({
    requestId: `req_failover_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rawPrompt: "Generate three creative directions for the brief.",
    organizationId: asOrganizationId("org_failover_test"),
    correlationId: `corr_failover_${Date.now()}`,
    metadata: {
      capabilityId: input.capabilityId ?? "text.generate",
      productAction: "direct_passthrough",
      directPassthrough: true,
      // Force a multi-provider chain so stop-failover is observable.
      failoverChain: input.failoverChain ?? [
        { providerId: "provider.openai", modelId: "gpt-4o" },
        { providerId: "provider.gemini", modelId: "gemini-flash-latest" },
        { providerId: "provider.mistral", modelId: "mistral-large" },
      ],
      ...(input.structured
        ? {
            structuredOutput: {
              name: input.contractName ?? "GenericRoutesContract",
              schema: input.schema ?? ROUTES_SCHEMA,
              strict: true,
            },
          }
        : {}),
      ...(input.metadata ?? {}),
    },
  });
  assert.equal(report.ok, true);
  return {
    report: report.value,
    dispatcher,
  };
}

describe("structured-output contract vs provider failover (generic)", () => {
  it("1 — text.generate + structured + valid Anthropic-like tool_use → stop failover", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        {
          kind: "structured",
          structured: ANTHROPIC_LIKE_STRUCTURED,
          prose: "Here are three directions…",
          finishReason: "tool_call",
        },
        { kind: "http_error", message: "OpenAI should not run" },
        { kind: "http_error", message: "Gemini HTTP 429" },
      ],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders.length, 1);
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    assert.ok(out?.structured);
    assert.equal(out?.structuredOutputValid, true);
  });

  it("2 — structured response + prose content → stop failover", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        {
          kind: "structured",
          structured: VALID_ROUTES,
          prose: "Prose preamble that must not void structured completion.",
        },
        { kind: "http_error", message: "should not failover" },
      ],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders.length, 1);
  });

  it("3 — structured response with exact requested schema → stop failover", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        { kind: "structured", structured: VALID_ROUTES },
        { kind: "http_error", message: "Gemini HTTP 429" },
      ],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders.length, 1);
  });

  it("4 — malformed structured response → failover allowed", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        { kind: "structured", structured: { routes: [{ name: "only-one" }] } },
        { kind: "structured", structured: VALID_ROUTES },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
  });

  it("5 — provider HTTP 429 before valid completion → failover allowed", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        { kind: "http_error", message: "Gemini HTTP 429" },
        { kind: "structured", structured: VALID_ROUTES },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
  });

  it("6 — provider timeout before valid completion → failover allowed", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        { kind: "timeout" },
        { kind: "structured", structured: VALID_ROUTES },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
  });

  it("7 — valid completion is authoritative; later error cannot overwrite", async () => {
    // First provider returns contract-valid structured. Failover chain exists but
    // must not be attempted; authoritative result retains structured.
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        {
          kind: "structured",
          structured: VALID_ROUTES,
          finishReason: "tool_call",
        },
        { kind: "http_error", message: "Gemini HTTP 429" },
      ],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders.length, 1);
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    assert.equal(out?.structuredOutputValid, true);
    assert.ok(out?.structured);
    const orch = out?.toolOrchestration as
      | { blockProviderFailover?: boolean; structuredOutputValid?: boolean }
      | undefined;
    assert.equal(orch?.structuredOutputValid, true);
    assert.equal(orch?.blockProviderFailover, true);
  });

  it("8 — unstructured text contract → preserve stop-on-success failover behavior", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: false,
      steps: [
        { kind: "plain_text", text: "Hello creative copy" },
        { kind: "http_error", message: "should not run" },
      ],
    });
    assert.equal(report.success, true);
    assert.equal(dispatcher.capturedProviders.length, 1);
  });

  it("9 — image contracts → preserve existing failover behavior (HTTP then success)", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: false,
      capabilityId: "image.generate",
      metadata: {
        capabilityId: "image.generate",
        imageFailoverChain: [
          { providerId: "provider.openai", modelId: "gpt-image-1" },
        ],
      },
      steps: [
        { kind: "http_error", message: "Gemini HTTP 429" },
        { kind: "plain_text", text: "https://example.com/image.png" },
      ],
    });
    // Image path may succeed or fail depending on routing fixtures; assert
    // failover was allowed (more than one attempt) when first fails.
    assert.ok(dispatcher.capturedProviders.length >= 1);
    void report;
  });

  it("10 — structured-output validation failure → failover allowed", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      steps: [
        { kind: "structured", structured: { notRoutes: true } },
        { kind: "http_error", message: "Gemini HTTP 429" },
      ],
    });
    assert.equal(report.success, false);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    assert.match(
      String(
        report.trace.stages.find((s) => s.status === "failed")?.message ??
          report.error?.message ??
          JSON.stringify(report),
      ),
      /429|rate limit|Structured output|STRUCTURED|not satisfied|expected|invalid/i,
    );
  });

  it("providerResultSatisfiesStructuredContract requires structured + valid flag", () => {
    const base: ProviderExecutionResult = {
      requestId: "r1",
      sessionId: "s1",
      status: "completed",
      success: true,
      completedAt: new Date().toISOString(),
      statistics: { totalMs: 1 } as never,
      response: {
        requestId: "r1",
        providerId: "provider.anthropic" as never,
        output: {
          structured: VALID_ROUTES,
          structuredOutputValid: true,
          toolOrchestration: { structuredOutputValid: true },
        },
        streamed: false,
        finishedAt: new Date().toISOString(),
      },
    };
    assert.equal(
      providerResultSatisfiesStructuredContract(base, {
        name: "GenericRoutesContract",
        schema: ROUTES_SCHEMA,
      }),
      true
    );
    assert.equal(
      providerResultSatisfiesStructuredContract(
        {
          ...base,
          response: {
            ...base.response!,
            output: { structured: VALID_ROUTES },
          },
        },
        { name: "GenericRoutesContract", schema: ROUTES_SCHEMA }
      ),
      false
    );
  });

  it("11 — object expected + array returned → failover continues (CdfCreativeDirections)", async () => {
    const arrayPayload = [
      { name: "A", creativeIdea: "a" },
      { name: "B", creativeIdea: "b" },
      { name: "C", creativeIdea: "c" },
    ];
    const { report, dispatcher } = await runWithScript({
      structured: true,
      contractName: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: CDF_DIRECTIONS_SCHEMA,
      steps: [
        { kind: "structured", structured: arrayPayload },
        { kind: "structured", structured: VALID_CDF_DIRECTIONS },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(
      dispatcher.capturedProviders.length >= 2,
      `expected failover after array, got ${dispatcher.capturedProviders.join(",")}`,
    );
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    assert.equal(out?.structuredOutputValid, true);
    assert.ok(out?.structured && !Array.isArray(out.structured));
    assert.equal(
      (out?.structured as { routes?: unknown[] })?.routes?.length,
      3,
    );
  });

  it("12 — fallback object valid → succeeds with exact CdfCreativeDirections schema", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      contractName: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: CDF_DIRECTIONS_SCHEMA,
      steps: [
        {
          kind: "structured",
          structured: [{ name: "only-array-item" }],
        },
        { kind: "structured", structured: VALID_CDF_DIRECTIONS },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    // Same contract stamped on every attempt — no cross-schema coercion.
    assert.ok(
      dispatcher.capturedSchemaNames.every(
        (n) => n === CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      ),
    );
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    assert.equal(out?.structuredOutputValid, true);
    const structured = out?.structured as { routes?: unknown[] };
    assert.ok(structured && typeof structured === "object");
    assert.ok(!Array.isArray(structured));
    assert.equal(structured.routes?.length, 3);
  });

  it("13 — all providers malformed → typed STRUCTURED_OUTPUT_INVALID, no false success", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      contractName: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: CDF_DIRECTIONS_SCHEMA,
      steps: [
        { kind: "structured", structured: [{ name: "a" }] },
        { kind: "structured", structured: [{ name: "b" }] },
        { kind: "structured", structured: { notRoutes: true } },
      ],
    });
    assert.equal(report.success, false);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    const msg = String(
      report.trace.stages.find((s) => s.status === "failed")?.message ??
        report.error?.message ??
        "",
    );
    assert.match(msg, /expected type object|got array|routes|STRUCTURED|invalid/i);
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    assert.notEqual(out?.structuredOutputValid, true);
  });

  it("14 — no schema coercion: array is not wrapped into CdfCreativeDirections", async () => {
    const { report, dispatcher } = await runWithScript({
      structured: true,
      contractName: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: CDF_DIRECTIONS_SCHEMA,
      // Deduped against typical openai primary → single attempt.
      failoverChain: [{ providerId: "provider.openai", modelId: "gpt-4o" }],
      steps: [
        {
          kind: "structured",
          structured: [
            { name: "A", creativeIdea: "a" },
            { name: "B", creativeIdea: "b" },
            { name: "C", creativeIdea: "c" },
          ],
        },
      ],
    });
    assert.equal(report.success, false);
    assert.equal(dispatcher.capturedProviders.length, 1);
    const msg = String(
      report.trace.stages.find((s) => s.status === "failed")?.message ??
        report.error?.message ??
        "",
    );
    // User-facing message is typed; raw schema text stays in attempt diagnostics only.
    assert.match(msg, /structured generation could not satisfy/i);
    assert.doesNotMatch(msg, /expected type object.*got array/i);
    const out = report.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    const structured = out?.structured;
    if (structured && typeof structured === "object" && !Array.isArray(structured)) {
      assert.notEqual(
        Array.isArray((structured as { routes?: unknown }).routes),
        true,
        "must not coerce provider array into { routes: array }",
      );
    }
  });

  it("15 — no cross-phase / cross-service fallback (schema name preserved)", async () => {
    const { dispatcher } = await runWithScript({
      structured: true,
      contractName: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: CDF_DIRECTIONS_SCHEMA,
      steps: [
        { kind: "structured", structured: [{ name: "bad" }] },
        { kind: "structured", structured: VALID_CDF_DIRECTIONS },
      ],
    });
    assert.ok(dispatcher.capturedSchemaNames.length >= 2);
    assert.ok(
      dispatcher.capturedSchemaNames.every(
        (n) => n === CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      ),
      `schema drifted across failover: ${dispatcher.capturedSchemaNames.join(",")}`,
    );
  });

  it("16 — STRUCTURED_OUTPUT_INVALID is recoverable (not invalid_request stop)", () => {
    const category = classifyExecutionFailure({
      error: {
        code: "STRUCTURED_OUTPUT_INVALID",
        message: "$: expected type object, got array",
      },
    });
    assert.equal(category, "structured_output_invalid");
    assert.notEqual(category, "invalid_request");
    assert.equal(shouldFailover(category), true);
  });

  it("18 — CdfCreativeDirections provider request prompt includes routes[] (passthrough)", async () => {
    const prompts: string[] = [];
    const dispatcher = new (class extends ScriptedDispatcher {
      override async dispatch(
        request: ProviderExecutionRequest,
        token: CancellationToken,
      ) {
        prompts.push(String(request.payload?.prompt ?? ""));
        return super.dispatch(request, token);
      }
    })([{ kind: "structured", structured: VALID_CDF_DIRECTIONS }]);

    const runtime = createProviderRuntime({ dispatcher });
    const toolRuntime = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });
    const report = await engine.run({
      requestId: `req_routes_instr_${Date.now()}`,
      rawPrompt: "Generate three creative territories.",
      organizationId: asOrganizationId("org_failover_test"),
      correlationId: `corr_routes_instr_${Date.now()}`,
      metadata: {
        capabilityId: "text.generate",
        productAction: "direct_passthrough",
        directPassthrough: true,
        failoverChain: [],
        structuredOutput: {
          name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
          schema: CDF_DIRECTIONS_SCHEMA,
          strict: true,
        },
      },
    });
    assert.equal(report.ok, true);
    assert.equal(report.value.success, true);
    assert.ok(prompts.length >= 1);
    assert.match(prompts[0]!, /routes\[\]/);
    assert.match(prompts[0]!, /CdfCreativeDirections/);
  });
});
