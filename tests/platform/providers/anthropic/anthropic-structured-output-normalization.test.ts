/**
 * Anthropic structured-output normalization — provider-agnostic contract.
 *
 * Forced json_schema (translated to tool_use) must elevate ANY non-empty
 * tool input to output.structured — not only Presentation/Website shapes.
 */

import { mapAnthropicResponseToCanonical } from "../../../../src/platform/providers/anthropic/responses/response-mapper";
import { mapCanonicalToAnthropicRequest } from "../../../../src/platform/providers/anthropic/requests/request-mapper";
import { SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA } from "../../../../src/platform/os/delivery/cdf-text-choice-schemas";
import {
  buildIntegrationJobSummary,
  CDF_STRUCTURED_OUTPUT_MISSING,
} from "../../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import type { DirectExecutionReport } from "../../../../src/platform/direct/contracts";
import type { ProviderAdapterRequest } from "../../../../src/platform/providers/adapters/contracts/adapter-io";

function baseRequest(
  patch?: Partial<ProviderAdapterRequest>,
): ProviderAdapterRequest {
  return {
    requestId: "req_anthropic_cdf",
    providerId: "provider.anthropic" as never,
    adapterId: "anthropic" as never,
    modelId: "claude-sonnet-4-5",
    capabilityId: "text.generate" as never,
    modality: "text",
    input: {},
    parameters: {},
    features: ["response_format"],
    streaming: false,
    timeoutMs: 120_000,
    metadata: {},
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

function requestWithCdfSocialMediaRoutes(): ProviderAdapterRequest {
  return baseRequest({
    input: {
      prompt: "Generate three creative directions",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "CdfSocialMediaRoutes",
          strict: true,
          schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA,
        },
      },
    },
  });
}

const SAMPLE_ROUTES = {
  routes: [
    {
      name: "Bold Crunch",
      idea: "High-contrast snack hero",
      visualTreatment: "Macro product, neon rim light",
      headline: "Crunch louder",
      whyItFits: "Matches youth energy brief",
    },
    {
      name: "Street Quiet",
      idea: "Minimal urban still",
      visualTreatment: "Soft daylight, negative space",
      headline: "Quiet power",
      whyItFits: "Premium restraint",
    },
    {
      name: "Party Pack",
      idea: "Social occasion montage",
      visualTreatment: "Multi-frame collage",
      headline: "Share the crunch",
      whyItFits: "Platform social proof",
    },
  ],
};

describe("Anthropic structured-output normalization (generic)", () => {
  it("maps response_format.json_schema to forced Anthropic tool with real schema", () => {
    const wire = mapCanonicalToAnthropicRequest(
      requestWithCdfSocialMediaRoutes(),
      "claude-sonnet-4-5",
    );
    const body = wire.body as Record<string, unknown>;
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools[0]?.name).toBe("CdfSocialMediaRoutes");
    expect(tools[0]?.input_schema).toBeTruthy();
    const schema = tools[0]?.input_schema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: "CdfSocialMediaRoutes",
    });
  });

  it("promotes CdfSocialMediaRoutes tool_use.input to output.structured", () => {
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          {
            type: "tool_use",
            name: "CdfSocialMediaRoutes",
            input: SAMPLE_ROUTES,
          },
        ],
        stop_reason: "tool_use",
      },
      requestWithCdfSocialMediaRoutes(),
      120,
      new Date().toISOString(),
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.structured).toEqual(SAMPLE_ROUTES);
    expect(typeof out.content).toBe("string");
    expect(String(out.content)).toContain("Bold Crunch");
  });

  it("promotes structured even when Claude also emits prose text blocks", () => {
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          { type: "text", text: "Here are three directions for your brief." },
          {
            type: "tool_use",
            name: "CdfSocialMediaRoutes",
            input: SAMPLE_ROUTES,
          },
        ],
        stop_reason: "tool_use",
      },
      requestWithCdfSocialMediaRoutes(),
      120,
      new Date().toISOString(),
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.structured).toEqual(SAMPLE_ROUTES);
    // Tool JSON preferred over prose for content when schema was requested.
    expect(String(out.content)).toContain("Bold Crunch");
    expect(String(out.content)).not.toContain("Here are three directions");
  });

  it("does not invent structured from plain prose when json_schema was requested", () => {
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [{ type: "text", text: "Direction 1: Bold. Direction 2: Soft." }],
        stop_reason: "end_turn",
      },
      requestWithCdfSocialMediaRoutes(),
      80,
      new Date().toISOString(),
    );
    const out = mapped.output as Record<string, unknown>;
    expect(out.structured).toBeUndefined();
  });

  it("job summary fail-closes CDF emission when structured missing after Anthropic success", () => {
    const report = {
      success: true,
      resultId: "res_1",
      durationMs: 10,
      stagesCompleted: ["provider_runtime"],
      request: {
        requestId: "req_1",
        organizationId: "org_1",
        prompt: "directions",
        metadata: {
          cdfServiceId: "social-media",
          cdfPhaseId: "routes",
          apiExecutionId: "exec_14_1789299974031",
          structuredOutput: {
            name: "CdfSocialMediaRoutes",
            schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA,
          },
        },
      },
      artifacts: {
        runtime: {
          response: {
            providerId: "provider.anthropic",
            output: { text: "prose only — no structured" },
            usage: {},
          },
          finalProviderId: "provider.anthropic",
          finalModelId: "claude-sonnet-4-5",
          statistics: { totalMs: 10 },
          attemptHistory: [],
          failoverCount: 0,
        },
        routing: {
          plan: {
            primary: {
              providerId: "provider.anthropic",
              modelId: "claude-sonnet-4-5",
            },
          },
        },
        task: { capabilityMap: { primary: "text.generate" } },
      },
      trace: { stages: [] },
    } as unknown as DirectExecutionReport;

    const summary = buildIntegrationJobSummary({
      report,
      executionMode: "live",
      durationMs: 10,
    });
    expect(summary.success).toBe(false);
    expect(String(summary.errorMessage)).toContain(CDF_STRUCTURED_OUTPUT_MISSING);
  });

  it("job summary preserves Anthropic-normalized structured into structuredData", () => {
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          {
            type: "tool_use",
            name: "CdfSocialMediaRoutes",
            input: SAMPLE_ROUTES,
          },
        ],
        stop_reason: "tool_use",
      },
      requestWithCdfSocialMediaRoutes(),
      100,
      new Date().toISOString(),
    );
    const report = {
      success: true,
      resultId: "res_ok",
      durationMs: 10,
      stagesCompleted: ["provider_runtime"],
      request: {
        requestId: "req_ok",
        organizationId: "org_1",
        prompt: "directions",
        metadata: {
          cdfServiceId: "social-media",
          cdfPhaseId: "routes",
          structuredOutput: {
            name: "CdfSocialMediaRoutes",
            schema: SOCIAL_MEDIA_ROUTES_STRUCTURED_SCHEMA,
          },
        },
      },
      artifacts: {
        runtime: {
          response: {
            providerId: "provider.anthropic",
            output: mapped.output,
            usage: {},
          },
          finalProviderId: "provider.anthropic",
          finalModelId: "claude-sonnet-4-5",
          statistics: { totalMs: 10 },
          attemptHistory: [],
          failoverCount: 0,
        },
        routing: {
          plan: {
            primary: {
              providerId: "provider.openai",
              modelId: "gpt-4o",
            },
          },
        },
        task: { capabilityMap: { primary: "text.generate" } },
      },
      trace: { stages: [] },
    } as unknown as DirectExecutionReport;

    const summary = buildIntegrationJobSummary({
      report,
      executionMode: "live",
      durationMs: 10,
    });
    expect(summary.success).toBe(true);
    expect(summary.structuredData).toBeTruthy();
    expect(
      (summary.structuredData as { routes: unknown[] }).routes?.length,
    ).toBe(3);
    // Failover-shaped: routed OpenAI, actual Anthropic — structured still present.
    expect(summary.fallbackUsed).toBe(true);
  });
});
