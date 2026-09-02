/**
 * Production presentation expansion — structured output extraction + recovery.
 * Deterministic, zero paid API calls.
 */

import type { ProviderExecutionResult } from "../../../../src/platform/providers/runtime/contracts/provider-execution-response";
import {
  attachStructuredOutput,
  parseOrRecoverStructuredOutput,
} from "../../../../src/platform/providers/tools/structured/structured-output-execution";
import {
  buildPresentationExpansionDiagnostic,
  classifyPresentationExpansionOutcome,
} from "../../../../src/platform/providers/tools/structured/presentation-expansion-diagnostics";
import { mapAnthropicResponseToCanonical } from "../../../../src/platform/providers/anthropic/responses/response-mapper";
import { PRESENTATION_ROUTES_STRUCTURED_SCHEMA } from "../../../../src/platform/os/delivery/presentation-schemas";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../../src/platform/os/delivery/document-export-service";
import {
  simulatedPresentationRouteConceptsJson,
  simulatedPresentationRoutesJson,
  ControllableDispatcher,
} from "../../../../src/platform/providers/runtime/testing";
import { createDirectExecutionEngine } from "../../../../src/platform/direct/direct-execution-engine";
import { createProviderRuntime } from "../../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { createToolRuntimePlatform } from "../../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import { executeBenchmarkOsPipeline } from "../../../../src/platform/providers/routing/performance/benchmark/engine/benchmark-os-execution-bridge";
import {
  DEFAULT_BENCHMARK_STRATEGY,
  getBenchmarkCase,
} from "../../../../src/platform/providers/routing/performance/benchmark";
import * as documentExportService from "../../../../src/platform/os/delivery/document-export-service";

const routesStructured = {
  name: "PresentationRoutes",
  schema: PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
    string,
    unknown
  >,
  strict: true,
} as const;

function mockProviderResult(
  output: Record<string, unknown>,
  overrides?: Partial<ProviderExecutionResult>
): ProviderExecutionResult {
  return {
    requestId: "req_expand_test",
    success: true,
    status: "completed",
    response: {
      requestId: "req_expand_test",
      providerId: "provider.openai" as never,
      output: Object.freeze(output),
      streamed: false,
      finishedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe("presentation expansion structured output pipeline", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses valid provider expansion JSON into exportable PresentationRoutes", () => {
    const routes = JSON.parse(simulatedPresentationRoutesJson()) as unknown;
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify(routes),
      routesStructured
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsePresentationRoutes(parsed.value)?.length).toBeGreaterThanOrEqual(1);
    }

    const attached = attachStructuredOutput(
      mockProviderResult({ content: simulatedPresentationRoutesJson() }),
      routesStructured,
      () => new Date().toISOString()
    );
    expect(attached.ok).toBe(true);
    if (attached.ok) {
      const out = attached.value.response?.output as Record<string, unknown>;
      expect(out.structuredOutputValid).toBe(true);
      expect(parsePresentationRoutes(out.structured)).not.toBeNull();
    }
  });

  it("recovers near-miss provider routes (missing deckTitle/layout)", () => {
    const nearMiss = {
      routes: [
        {
          title: "Heritage",
          description: "Warm story",
          slides: [
            {
              title: "Opening",
              bullets: ["Brand-led growth", "Clear ICP"],
            },
          ],
        },
      ],
    };
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify(nearMiss),
      routesStructured
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsePresentationRoutes(parsed.value)).not.toBeNull();
    }
  });

  it("unwraps schema-name envelope keys from provider JSON", () => {
    const wrapped = {
      PresentationRoutes: JSON.parse(simulatedPresentationRoutesJson()),
    };
    const recovered = recoverPresentationRoutesPayload(wrapped);
    expect(parsePresentationRoutes(recovered)).not.toBeNull();
  });

  it("recovers exportable routes from JSON string payloads", () => {
    const json = simulatedPresentationRoutesJson();
    expect(parsePresentationRoutes(recoverPresentationRoutesPayload(json))).not.toBeNull();
  });

  it("prefers exportable routes in content over stale concepts-only structured", () => {
    const attached = attachStructuredOutput(
      mockProviderResult({
        structured: JSON.parse(simulatedPresentationRouteConceptsJson()),
        content: simulatedPresentationRoutesJson(),
      }),
      routesStructured,
      () => new Date().toISOString()
    );
    expect(attached.ok).toBe(true);
    if (attached.ok) {
      expect(attached.value.success).not.toBe(false);
      const out = attached.value.response?.output as Record<string, unknown>;
      expect(out.structuredOutputValid).toBe(true);
      const routes = parsePresentationRoutes(
        recoverPresentationRoutesPayload(out.structured)
      );
      expect(routes).not.toBeNull();
      expect(routes!.some((r) => r.deck.slides.length > 0)).toBe(true);
      expect(
        out.structured &&
          typeof out.structured === "object" &&
          "concepts" in (out.structured as object) &&
          !("routes" in (out.structured as object))
      ).toBe(false);
    }
  });

  it("leaves invalid provider JSON as structured output failure", () => {
    const invalid = { concepts: [{ title: "Only concepts", description: "x" }] };
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify(invalid),
      routesStructured
    );
    expect(parsed.ok).toBe(false);

    const attached = attachStructuredOutput(
      mockProviderResult({ content: JSON.stringify(invalid) }),
      routesStructured,
      () => new Date().toISOString()
    );
    expect(attached.ok).toBe(true);
    if (attached.ok) {
      expect(attached.value.success).toBe(false);
      const out = attached.value.response?.output as Record<string, unknown>;
      expect(out.structuredOutputValid).not.toBe(true);
    }
  });

  it("does not classify valid structured output as PROVIDER_OPERATIONAL_FAILURE shape", () => {
    const attached = attachStructuredOutput(
      mockProviderResult({
        structured: JSON.parse(simulatedPresentationRoutesJson()),
        content: simulatedPresentationRoutesJson(),
      }),
      routesStructured,
      () => new Date().toISOString()
    );
    expect(attached.ok).toBe(true);
    if (attached.ok) {
      expect(attached.value.success).not.toBe(false);
      expect(attached.value.error).toBeUndefined();
      const out = attached.value.response?.output as Record<string, unknown>;
      expect(out.structuredOutputValid).toBe(true);
      expect(parsePresentationRoutes(out.structured)).not.toBeNull();
    }
  });

  it("classifies provider dispatch failure as PROVIDER_ERROR not missing routes", () => {
    const category = classifyPresentationExpansionOutcome({
      providerResult: mockProviderResult({}, {
        success: false,
        status: "failed",
        error: { code: "PROVIDER_ERROR", message: "OpenAI HTTP 401" },
      }),
      parsedExportable: false,
      hasRoutesArray: false,
    });
    expect(category).toBe("PROVIDER_ERROR");
  });

  it("classifies STRUCTURED_OUTPUT_INVALID as INVALID_STRUCTURED_OUTPUT", () => {
    const attached = attachStructuredOutput(
      mockProviderResult({ content: "not-json" }),
      routesStructured,
      () => new Date().toISOString()
    );
    expect(attached.ok).toBe(true);
    if (attached.ok) {
      expect(attached.value.success).toBe(false);
      expect(attached.value.error?.code).toBe("STRUCTURED_OUTPUT_INVALID");
      const category = classifyPresentationExpansionOutcome({
        providerResult: attached.value,
        structuredOutputValid: false,
        parsedExportable: false,
        hasRoutesArray: false,
      });
      expect(category).toBe("INVALID_STRUCTURED_OUTPUT");
    }
  });

  it("recovers Anthropic normalized shape: empty tool_use + text routes JSON", () => {
    const mapped = mapAnthropicResponseToCanonical(
      {
        content: [
          { type: "tool_use", name: "PresentationRoutes", input: {} },
          { type: "text", text: simulatedPresentationRoutesJson() },
        ],
        stop_reason: "tool_use",
      },
      {
        requestId: "r1",
        providerId: "provider.anthropic" as never,
        adapterId: "a" as never,
        modelId: "claude-sonnet-4-5",
        capabilityId: "text.generate" as never,
        modality: "text",
        input: {},
        parameters: {},
        features: [],
        streaming: false,
        timeoutMs: 120_000,
        metadata: {},
        createdAt: new Date().toISOString(),
      },
      50,
      new Date().toISOString()
    );
    const out = mapped.output as Record<string, unknown>;
    const attached = attachStructuredOutput(
      mockProviderResult(out),
      routesStructured,
      () => new Date().toISOString()
    );
    expect(attached.ok).toBe(true);
    if (attached.ok) {
      expect(attached.value.success).not.toBe(false);
      expect(parsePresentationRoutes(attached.value.response?.output?.structured)).not.toBeNull();
    }
  });

  it("builds safe expansion diagnostics without prompt or key fields", () => {
    const diag = buildPresentationExpansionDiagnostic({
      requestId: "req_diag",
      providerRequest: {
        providerId: "provider.openai",
        modelId: "gpt-4o",
        metadata: { executionId: "exec_1" },
      },
      providerResult: mockProviderResult({
        content: simulatedPresentationRoutesJson(),
      }),
      schemaName: "PresentationRoutes",
      output: { content: simulatedPresentationRoutesJson() },
      structuredOutputValid: true,
    });
    expect(diag.requestId).toBe("req_diag");
    expect(diag.executionId).toBe("exec_1");
    expect(diag.parseExportable).toBe(true);
    expect(diag.failureCategory).toBe("EXPANSION_OK");
    expect(JSON.stringify(diag)).not.toMatch(/api[_-]?key/i);
  });

  it("sends PresentationRoutes schema on expansion dispatch (2nd provider call)", async () => {
    jest
      .spyOn(documentExportService, "buildPresentationPptx")
      .mockResolvedValue(Buffer.from("PK-fake-pptx"));

    const captured: Array<Record<string, unknown>> = [];
    class CapturingDispatcher extends ControllableDispatcher {
      async dispatch(request: Parameters<ControllableDispatcher["dispatch"]>[0], token: Parameters<ControllableDispatcher["dispatch"]>[1]) {
        captured.push({
          requestId: request.requestId,
          payload: { ...request.payload },
        });
        return super.dispatch(request, token);
      }
    }

    const dispatcher = new CapturingDispatcher({ mode: "success" });
    const runtime = createProviderRuntime({ dispatcher });
    const toolRuntime = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });
    const bc = getBenchmarkCase("bench.presentations.pitch-decks")!;

    await executeBenchmarkOsPipeline(
      { engine },
      {
        benchmarkCase: bc,
        model: {
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          capabilityId: "text.generate",
        },
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_wire_test",
        executionId: "exec_wire_test",
      }
    );

    expect(captured.length).toBeGreaterThanOrEqual(2);
    const expansionCall = captured.find((c) =>
      String(c.requestId).includes("_pres_expand")
    );
    expect(expansionCall).toBeTruthy();
    const payload = expansionCall!.payload as Record<string, unknown>;
    const rf = payload.response_format as {
      json_schema?: { name?: string };
    };
    expect(rf?.json_schema?.name).toBe("PresentationRoutes");
    const messages = payload.messages as Array<{ role: string; content: string }>;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(payload.tools).toBeUndefined();
  });
});
