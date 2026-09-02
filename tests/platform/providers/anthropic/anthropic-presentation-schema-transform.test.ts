/**
 * Anthropic tool input_schema transform for PresentationRoutes — HTTP 400 regression.
 */

import { transformSchemaForAnthropicToolInput } from "../../../../src/platform/providers/anthropic/structured-output/schema-transform";
import { mapCanonicalToAnthropicRequest } from "../../../../src/platform/providers/anthropic/requests/request-mapper";
import { toAdapterRequestFromExecution } from "../../../../src/platform/providers/common/to-adapter-request";
import { normalizeSchemaForOpenAiStrict } from "../../../../src/platform/providers/tools/structured/structured-output-execution";
import {
  PRESENTATION_ROUTE_CONCEPTS_SCHEMA,
  PRESENTATION_ROUTES_STRUCTURED_SCHEMA,
} from "../../../../src/platform/os/delivery/presentation-schemas";
import { sampleRequest } from "../../../../src/platform/providers/runtime/testing";
import { summarizePresentationExpansionWireRequest } from "../../../../src/platform/providers/tools/structured/presentation-expansion-wire-diagnostics";

function schemaHasUnsupportedConstraintKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some(schemaHasUnsupportedConstraintKeys);
  }
  const rec = value as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (key === "maxItems") return true;
    if (key === "minItems" && rec.minItems !== 0 && rec.minItems !== 1) return true;
    if (
      ["minimum", "maximum", "minLength", "maxLength", "pattern"].includes(key)
    ) {
      return true;
    }
    if (schemaHasUnsupportedConstraintKeys(rec[key])) return true;
  }
  return false;
}

describe("Anthropic PresentationRoutes schema wire transform", () => {
  it("strips unsupported minItems/maxItems from canonical PresentationRoutes schema", () => {
    const canonical = normalizeSchemaForOpenAiStrict(
      PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>
    );
    expect(JSON.stringify(canonical)).toContain("maxItems");

    const wire = transformSchemaForAnthropicToolInput(canonical);
    expect(schemaHasUnsupportedConstraintKeys(wire)).toBe(false);
    expect((wire.properties as Record<string, unknown>).routes).toBeDefined();
  });

  it("preserves canonical schema unchanged", () => {
    const canonical = normalizeSchemaForOpenAiStrict(
      PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>
    );
    const before = JSON.stringify(canonical);
    transformSchemaForAnthropicToolInput(canonical);
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it("maps expansion request to forced tool_use with transformed schema", () => {
    const schema = normalizeSchemaForOpenAiStrict(
      PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>
    );
    const prompt = "Expand to PresentationRoutes JSON.";
    const payload = {
      prompt,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "PresentationRoutes", strict: true, schema },
      },
    };
    const execReq = {
      ...sampleRequest({
        requestId: "anth_wire",
        providerId: "provider.anthropic",
        payload,
      }),
      capabilityId: "text.generate",
      modelId: "anthropic/claude-sonnet-4-5",
      options: { max_tokens: 16_384 },
    };
    const adapterReq = toAdapterRequestFromExecution({
      request: execReq as never,
      canonicalProviderId: "provider.anthropic",
      adapterId: "anthropic",
      nowIso: new Date().toISOString(),
    });
    const wire = mapCanonicalToAnthropicRequest(adapterReq, "claude-sonnet-4-5");
    const body = wire.body as Record<string, unknown>;
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("PresentationRoutes");
    expect(body.tool_choice).toEqual({ type: "tool", name: "PresentationRoutes" });
    expect(schemaHasUnsupportedConstraintKeys(tools[0]?.input_schema)).toBe(false);
  });

  it("concepts schema also contains constraints stripped for wire", () => {
    const canonical = normalizeSchemaForOpenAiStrict(
      PRESENTATION_ROUTE_CONCEPTS_SCHEMA as unknown as Record<string, unknown>
    );
    const wireJson = JSON.stringify(transformSchemaForAnthropicToolInput(canonical));
    expect(schemaHasUnsupportedConstraintKeys(JSON.parse(wireJson))).toBe(false);
  });

  it("wire summary reports anthropic tool mode", () => {
    const schema = normalizeSchemaForOpenAiStrict(
      PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<string, unknown>
    );
    const execReq = {
      ...sampleRequest({
        requestId: "anth_summary",
        providerId: "provider.anthropic",
        payload: {
          prompt: "x",
          messages: [{ role: "user", content: "x" }],
          response_format: {
            type: "json_schema",
            json_schema: { name: "PresentationRoutes", strict: true, schema },
          },
        },
      }),
      capabilityId: "text.generate",
      modelId: "anthropic/claude-sonnet-4-5",
    };
    const summary = summarizePresentationExpansionWireRequest(execReq as never);
    expect(summary?.structuredOutputMode).toBe("anthropic_tool_input_schema");
    expect(summary?.toolCount).toBe(1);
  });
});
