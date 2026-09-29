/**
 * Web Tech sitemap structured-contract + provider failover regressions.
 *
 * Live chain (exec_14_1790089698151):
 * 1) OpenAI credit_balance_exhausted (HTTP 429) misclassified as rate_limit
 * 2) Anthropic invalid_request from integer / unsupported tool schema wire
 * 3) Gemini bare array / DeepSeek missing required fields without prompt guidance
 */

import assert from "node:assert/strict";
import { extractProviderErrorDiagnostics } from "../../../src/platform/providers/runtime/diagnostics/provider-error-extraction";
import { ProviderError } from "../../../src/platform/core/errors";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../src/platform/core/result";
import {
  createDirectExecutionEngine,
  providerResultSatisfiesStructuredContract,
  userFacingProviderFailureMessage,
} from "../../../src/platform/direct/direct-execution-engine";
import {
  CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
  CDF_WEBSITE_SITEMAP_SCHEMA,
} from "../../../src/platform/os/delivery/cdf-website-sitemap-schemas";
import { transformSchemaForAnthropicToolInput } from "../../../src/platform/providers/anthropic/structured-output/schema-transform";
import { mapCanonicalToAnthropicRequest } from "../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../src/platform/providers/common/to-adapter-request";
import {
  classifyExecutionFailure,
  shouldFailover,
} from "../../../src/platform/providers/routing/performance/failover/failure-classification";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import {
  ControllableDispatcher,
} from "../../../src/platform/providers/runtime/testing";
import { sampleRequest } from "../../../src/platform/providers/runtime/testing";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";
import { asProviderId } from "../../../src/platform/core/identifiers";
import { validateAgainstJsonSchema } from "../../../src/platform/providers/tools/schema/json-schema-validator";
import {
  normalizeSchemaForOpenAiStrict,
  parseOrRecoverStructuredOutput,
  withStructuredOutputRequest,
} from "../../../src/platform/providers/tools/structured/structured-output-execution";

const SCHEMA = CDF_WEBSITE_SITEMAP_SCHEMA as unknown as Record<string, unknown>;

const VALID_SITEMAP = {
  siteHierarchy: [
    {
      id: "home",
      label: "Home",
      path: "/",
      children: [{ id: "about", label: "About", path: "/about" }],
    },
  ],
  globalNavigation: [
    { label: "Home", path: "/" },
    { label: "About", path: "/about" },
    { label: "Products", path: "/products" },
    { label: "Contact", path: "/contact" },
  ],
  pageCount: 4,
};

function baseRequest(prompt = "Build a corporate landing sitemap."): ProviderExecutionRequest {
  return {
    requestId: "req_sitemap_test",
    providerId: asProviderId("provider.gemini"),
    capabilityId: "text.generate" as never,
    payload: {
      prompt,
      text: prompt,
      input: prompt,
    },
    metadata: {
      productAction: "direct_passthrough",
      directPassthrough: true,
      capabilityId: "text.generate",
    },
  } as ProviderExecutionRequest;
}

type ScriptStep =
  | {
      readonly kind: "structured";
      readonly structured: Record<string, unknown> | unknown[];
      readonly prose?: string;
    }
  | {
      readonly kind: "http_error";
      readonly message: string;
      readonly providerErrorCode?: string;
      readonly httpStatus?: number;
    };

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
          metadata: {
            ...(typeof step.httpStatus === "number"
              ? { httpStatus: step.httpStatus }
              : {}),
            ...(step.providerErrorCode
              ? { providerErrorCode: step.providerErrorCode }
              : {}),
          },
        })
      );
    }

    const prose = step.prose ?? JSON.stringify(step.structured);
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

async function runSitemapScript(input: {
  readonly steps: readonly ScriptStep[];
  /** When set, uses a non-website contract so metadata.failoverChain is honored. */
  readonly honorFailoverChain?: readonly { providerId: string; modelId: string }[];
  readonly contractName?: string;
  readonly schema?: Record<string, unknown>;
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
  const contractName =
    input.contractName ?? CDF_WEBSITE_SITEMAP_CONTRACT_NAME;
  const schema = input.schema ?? SCHEMA;
  const report = await engine.run({
    requestId: `req_sitemap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rawPrompt: "Build a corporate landing sitemap for a SaaS product.",
    organizationId: asOrganizationId("org_sitemap_test"),
    correlationId: `corr_sitemap_${Date.now()}`,
    metadata: {
      capabilityId: "text.generate",
      productAction: "direct_passthrough",
      directPassthrough: true,
      ...(input.honorFailoverChain
        ? { failoverChain: input.honorFailoverChain }
        : {}),
      structuredOutput: {
        name: contractName,
        schema,
        strict: true,
      },
    },
  });
  assert.equal(report.ok, true);
  return { report: report.value, dispatcher };
}

describe("CdfWebsiteSitemap structured contract + credit/Anthropic fixes", () => {
  it("1 — credit_balance_exhausted classifies as quota (not rate_limit)", () => {
    const cat = classifyExecutionFailure({
      httpStatus: 429,
      error: {
        code: "PROVIDER_ERROR",
        message: "HTTP 429: You exceeded your current quota",
        httpStatus: 429,
        providerErrorCode: "credit_balance_exhausted",
      },
    });
    assert.equal(cat, "quota");
    assert.notEqual(cat, "rate_limit");
    assert.equal(shouldFailover(cat), true);
  });

  it("1b — Anthropic HTTP 400 invalid_request_error + credit message → quota", () => {
    const cat = classifyExecutionFailure({
      httpStatus: 400,
      error: {
        code: "PROVIDER_ERROR",
        message:
          "Anthropic HTTP 400: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        httpStatus: 400,
        providerErrorCode: "credit_balance_exhausted",
      },
    });
    assert.equal(cat, "quota");
    assert.notEqual(cat, "invalid_request");
    assert.notEqual(cat, "http_4xx");
  });

  it("1c — Anthropic envelope type invalid_request_error normalizes to credit_balance_exhausted", () => {
    const err = new ProviderError("Anthropic HTTP 400", {
      httpStatus: 400,
      body: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        },
      },
    });
    const diag = extractProviderErrorDiagnostics(err);
    assert.equal(diag.providerErrorCode, "credit_balance_exhausted");
    assert.match(diag.sanitizedMessage.toLowerCase(), /credit balance/);
    const cat = classifyExecutionFailure({
      httpStatus: diag.httpStatus,
      error: {
        code: "PROVIDER_ERROR",
        message: diag.sanitizedMessage,
        httpStatus: diag.httpStatus,
        providerErrorCode: diag.providerErrorCode,
      },
    });
    assert.equal(cat, "quota");
  });

  it("2 — plain HTTP 429 without credit code remains rate_limit", () => {
    const cat = classifyExecutionFailure({
      httpStatus: 429,
      error: {
        code: "PROVIDER_ERROR",
        message: "HTTP 429 Too Many Requests",
        httpStatus: 429,
      },
    });
    assert.equal(cat, "rate_limit");
  });

  it("3 — exhausted provider skipped for remaining attempts in same execution", async () => {
    // Non-website contract so metadata.failoverChain is honored (vendor-diverse).
    // Two OpenAI model slots appear in the declared chain; after credit exhaustion
    // the same provider must not be re-dispatched — only Gemini runs next.
    const routesSchema = {
      type: "object",
      additionalProperties: false,
      required: ["routes"],
      properties: {
        routes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: { name: { type: "string" } },
          },
        },
      },
    };
    const validRoutes = {
      routes: [{ name: "A" }, { name: "B" }, { name: "C" }],
    };
    const { report, dispatcher } = await runSitemapScript({
      contractName: "GenericRoutesContract",
      schema: routesSchema,
      honorFailoverChain: [
        { providerId: "provider.openai", modelId: "gpt-4o" },
        { providerId: "provider.openai", modelId: "gpt-4o-mini" },
        { providerId: "provider.gemini", modelId: "gemini-flash-latest" },
      ],
      steps: [
        {
          kind: "http_error",
          message: "HTTP 429: credit_balance_exhausted",
          httpStatus: 429,
          providerErrorCode: "credit_balance_exhausted",
        },
        { kind: "structured", structured: validRoutes },
      ],
    });
    assert.equal(report.success, true);
    assert.deepEqual(dispatcher.capturedProviders, [
      "provider.openai",
      "provider.gemini",
    ]);
    assert.equal(
      dispatcher.capturedProviders.filter((p) => p === "provider.openai").length,
      1,
    );
  });

  it("4 — Anthropic wire schema converts integer→number (no unsupported constraints)", () => {
    const canon = normalizeSchemaForOpenAiStrict(SCHEMA);
    assert.equal(
      (canon.properties as Record<string, { type?: string }>)?.pageCount?.type,
      "integer",
    );
    const wire = transformSchemaForAnthropicToolInput(canon);
    assert.equal(
      (wire.properties as Record<string, { type?: string }>)?.pageCount?.type,
      "number",
    );
    const json = JSON.stringify(wire);
    assert.doesNotMatch(json, /"type":"integer"/);
  });

  it("5 — Anthropic request mapper emits forced tool_use with transformed sitemap schema", () => {
    const schema = normalizeSchemaForOpenAiStrict(SCHEMA);
    const prompt = "Sitemap JSON.";
    const execReq = {
      ...sampleRequest({
        requestId: "anth_sitemap",
        providerId: "provider.anthropic",
        payload: {
          prompt,
          messages: [{ role: "user", content: prompt }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
              strict: true,
              schema,
            },
          },
        },
      }),
      capabilityId: "text.generate",
      modelId: "anthropic/claude-sonnet-4-5",
    };
    const adapterReq = toAdapterRequestFromExecution({
      request: execReq as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    const mapped = mapCanonicalToAnthropicRequest(adapterReq, "claude-sonnet-4-5");
    const body = mapped.body as Record<string, unknown>;
    const tools = body.tools as Array<Record<string, unknown>>;
    assert.equal(tools?.length, 1);
    assert.equal(tools[0]?.name, CDF_WEBSITE_SITEMAP_CONTRACT_NAME);
    assert.deepEqual(body.tool_choice, {
      type: "tool",
      name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
    });
    const pageCount = (
      (tools[0]?.input_schema as { properties?: Record<string, { type?: string }> })
        ?.properties ?? {}
    ).pageCount;
    assert.equal(pageCount?.type, "number");
  });

  it("6 — directPassthrough stamps CdfWebsiteSitemap object-root instructions", () => {
    const stamped = withStructuredOutputRequest(baseRequest(), {
      name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    const prompt = String(stamped.payload.prompt ?? "");
    assert.match(prompt, /CdfWebsiteSitemap/);
    assert.match(prompt, /siteHierarchy/);
    assert.match(prompt, /globalNavigation/);
    assert.match(prompt, /pageCount/);
    assert.match(prompt, /Do NOT return a bare JSON array/i);
    assert.doesNotMatch(prompt, /Required top-level keys ONLY: title.*steps/i);
    const rf = stamped.payload.response_format as {
      json_schema?: { name?: string; schema?: { required?: string[] } };
    };
    assert.equal(rf?.json_schema?.name, CDF_WEBSITE_SITEMAP_CONTRACT_NAME);
    const required = rf?.json_schema?.schema?.required ?? [];
    for (const key of ["siteHierarchy", "globalNavigation", "pageCount"]) {
      assert.ok(required.includes(key), `missing required ${key}`);
    }
    assert.deepEqual(
      [...(CDF_WEBSITE_SITEMAP_SCHEMA.required as readonly string[])].sort(),
      ["globalNavigation", "pageCount", "siteHierarchy"].sort(),
    );
  });

  it("7 — Gemini array rejected for object schema", () => {
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify([
        { id: "home", label: "Home" },
        { id: "about", label: "About" },
      ]),
      { name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME, schema: SCHEMA, strict: true },
    );
    assert.equal(parsed.ok, false);
  });

  it("8 — DeepSeek missing required fields rejected", () => {
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify({ title: "Sitemap", summary: "pages" }),
      { name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME, schema: SCHEMA, strict: true },
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(
        parsed.message.toLowerCase(),
        /required|sitehierarchy|globalnavigation|pagecount/,
      );
    }
  });

  it("9 — valid CdfWebsiteSitemap accepted", () => {
    const v = validateAgainstJsonSchema(VALID_SITEMAP, SCHEMA as never);
    assert.equal(v.ok, true);
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify(VALID_SITEMAP),
      { name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME, schema: SCHEMA, strict: true },
    );
    assert.equal(parsed.ok, true);
  });

  it("10 — invalid structured output never satisfies contract / canonical", () => {
    const failed = {
      success: false as const,
      status: "failed" as const,
      error: {
        code: "STRUCTURED_OUTPUT_INVALID",
        message: 'expected type object, got array',
      },
      response: {
        output: {
          structured: [{ id: "home" }],
          structuredOutputValid: false,
        },
      },
    };
    assert.equal(
      providerResultSatisfiesStructuredContract(failed as never, {
        name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
        schema: SCHEMA,
      }),
      false,
    );
    const arraySuccess = {
      success: true as const,
      status: "succeeded" as const,
      response: {
        output: {
          structured: [{ id: "home" }],
          structuredOutputValid: true,
        },
      },
    };
    assert.equal(
      providerResultSatisfiesStructuredContract(arraySuccess as never, {
        name: CDF_WEBSITE_SITEMAP_CONTRACT_NAME,
        schema: SCHEMA,
      }),
      false,
    );
  });

  it("11 — failover stops when a provider satisfies the contract", async () => {
    // CdfWebsiteSitemap uses website vendor-diverse failover (openai → anthropic → …).
    const { report, dispatcher } = await runSitemapScript({
      steps: [
        { kind: "structured", structured: [{ id: "home" }] },
        { kind: "structured", structured: VALID_SITEMAP },
        { kind: "structured", structured: { title: "should not run" } },
      ],
    });
    assert.equal(report.success, true);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    assert.equal(dispatcher.capturedProviders[0], "provider.openai");
    assert.equal(dispatcher.capturedProviders[1], "provider.anthropic");
    assert.equal(dispatcher.capturedProviders.length, 2);
    const out = report.artifacts.runtime?.response?.output as
      | { structured?: unknown; structuredOutputValid?: boolean }
      | undefined;
    assert.equal(out?.structuredOutputValid, true);
    assert.ok(
      out?.structured &&
        typeof out.structured === "object" &&
        !Array.isArray(out.structured) &&
        "siteHierarchy" in (out.structured as object),
    );
  });

  it("12 — all-provider contract failure produces one typed terminal failure", async () => {
    const { report, dispatcher } = await runSitemapScript({
      steps: [
        { kind: "structured", structured: [{ id: "home" }] },
        { kind: "structured", structured: { title: "missing required" } },
        { kind: "structured", structured: [{ id: "x" }] },
        { kind: "structured", structured: { summary: "nope" } },
      ],
    });
    assert.equal(report.success, false);
    assert.ok(dispatcher.capturedProviders.length >= 2);
    const msg = String(
      report.trace.stages.find((s) => s.status === "failed")?.message ??
        report.error?.message ??
        "",
    );
    assert.match(msg, /structured generation could not satisfy/i);
    assert.doesNotMatch(msg, /expected type/);
    assert.doesNotMatch(msg, /siteHierarchy/);
  });

  it("13 — typed terminal UX; no UI-only raw schema dump", () => {
    const msg = userFacingProviderFailureMessage({
      category: "structured_output_invalid",
      candidateCount: 4,
      originalMessage:
        'Structured output invalid: expected type "object", got "array"; missing required: siteHierarchy',
    });
    assert.match(msg, /structured generation could not satisfy/i);
    assert.doesNotMatch(msg, /expected type/);
    assert.doesNotMatch(msg, /siteHierarchy/);
  });
});
