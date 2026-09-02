/**
 * OpenAI wire request for PresentationRoutes expansion — HTTP 400 regression.
 */

import { mapCanonicalToOpenAIRequest } from "../../../../src/platform/providers/openai/requests/request-mapper";
import {
  normalizeOpenAiCompletionTokenParams,
  openAiUsesMaxCompletionTokens,
} from "../../../../src/platform/providers/openai/requests/openai-completion-params";
import { toAdapterRequestFromExecution } from "../../../../src/platform/providers/common/to-adapter-request";
import { normalizeSchemaForOpenAiStrict } from "../../../../src/platform/providers/tools/structured/structured-output-execution";
import { PRESENTATION_ROUTES_STRUCTURED_SCHEMA } from "../../../../src/platform/os/delivery/presentation-schemas";
import { sampleRequest } from "../../../../src/platform/providers/runtime/testing";
import { summarizePresentationExpansionWireRequest } from "../../../../src/platform/providers/tools/structured/presentation-expansion-wire-diagnostics";

function buildExpansionExecReq(providerId: string, modelId: string) {
  const schema = normalizeSchemaForOpenAiStrict(
    PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>
  );
  const prompt = "Respond with ONLY valid JSON for PresentationRoutes.";
  const payload = {
    prompt,
    text: prompt,
    input: prompt,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "PresentationRoutes", strict: true, schema },
    },
    max_tokens: 16_384,
  };
  const base = sampleRequest({ requestId: "wire_test", providerId, payload });
  return {
    ...base,
    capabilityId: "text.generate",
    modelId,
    options: {
      features: ["json_mode", "response_format"],
      maxTokens: 16_384,
      max_tokens: 16_384,
    },
  };
}

describe("OpenAI PresentationRoutes expansion wire request", () => {
  it("does not leak camelCase maxTokens (previously caused HTTP 400)", () => {
    const execReq = buildExpansionExecReq("provider.openai", "openai/gpt-4o");
    const adapterReq = toAdapterRequestFromExecution({
      request: execReq as never,
      canonicalProviderId: "provider.openai",
      adapterId: "openai",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToOpenAIRequest(adapterReq, "gpt-4o");
    const body = wire.body as Record<string, unknown>;

    expect(body.maxTokens).toBeUndefined();
    expect(body.max_tokens).toBe(16_384);
    expect(body.max_completion_tokens).toBeUndefined();
    expect((body.response_format as { type?: string }).type).toBe("json_schema");
    expect(body.tools).toBeUndefined();
  });

  it("maps gpt-5.x token limits to max_completion_tokens", () => {
    expect(openAiUsesMaxCompletionTokens("gpt-5.5")).toBe(true);
    const body: Record<string, unknown> = {
      model: "gpt-5.5",
      maxTokens: 16_384,
      max_tokens: 16_384,
    };
    normalizeOpenAiCompletionTokenParams(body, "gpt-5.5");
    expect(body.maxTokens).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(16_384);
  });

  it("wire summary reports valid OpenAI expansion shape", () => {
    const execReq = buildExpansionExecReq("provider.openai", "openai/gpt-4o");
    const summary = summarizePresentationExpansionWireRequest(execReq as never);
    expect(summary?.schemaName).toBe("PresentationRoutes");
    expect(summary?.schemaBytes).toBeGreaterThan(100);
    expect(summary?.messageCount).toBe(1);
    expect(summary?.hasInvalidOpenAiMaxTokens).toBe(false);
    expect(summary?.toolCount).toBe(0);
  });
});
