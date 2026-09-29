/**
 * CdfCreativeDirections — restore known-good routes prompt + strict validation.
 *
 * Regression: directPassthrough skipped schema instructions for this contract,
 * so Gemini (which ignores json_schema alone) emitted objects without `routes`.
 *
 * Do NOT coerce / wrap / synthesize routes. Keep schema fail-closed.
 */

import assert from "node:assert/strict";
import { asProviderId } from "../../../../src/platform/core/identifiers";
import {
  CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
  GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA,
} from "../../../../src/platform/os/delivery/cdf-text-choice-schemas";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import {
  parseOrRecoverStructuredOutput,
  withStructuredOutputRequest,
} from "../../../../src/platform/providers/tools/structured/structured-output-execution";
import { coerceValueTowardJsonSchema } from "../../../../src/platform/providers/tools/structured/structured-output-coerce";

const SCHEMA = GENERIC_CREATIVE_DIRECTION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
  string,
  unknown
>;

const VALID = {
  routes: [
    { name: "Territory A", creativeIdea: "a", rationale: "r" },
    { name: "Territory B", creativeIdea: "b", rationale: "r" },
    { name: "Territory C", creativeIdea: "c", rationale: "r" },
  ],
};

function baseRequest(prompt = "Create three brand territories."): ProviderExecutionRequest {
  return {
    requestId: "req_cdf_directions_test",
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

describe("CdfCreativeDirections structured-output (known-good path)", () => {
  it("1 — routes was historically required on the contract schema", () => {
    assert.equal(SCHEMA.type, "object");
    assert.ok(Array.isArray(SCHEMA.required));
    assert.ok((SCHEMA.required as string[]).includes("routes"));
  });

  it("2 — directPassthrough still stamps routes instructions + json_schema", () => {
    const stamped = withStructuredOutputRequest(baseRequest(), {
      name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    const prompt = String(stamped.payload.prompt ?? "");
    assert.match(prompt, /CdfCreativeDirections/);
    assert.match(prompt, /routes\[\]/);
    assert.match(prompt, /exactly 3 routes/i);
    assert.doesNotMatch(prompt, /Required top-level keys ONLY: title.*steps/i);
    const rf = stamped.payload.response_format as {
      type?: string;
      json_schema?: { name?: string; schema?: Record<string, unknown> };
    };
    assert.equal(rf?.type, "json_schema");
    assert.equal(rf?.json_schema?.name, CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME);
    assert.ok(
      Array.isArray(rf?.json_schema?.schema?.required) &&
        (rf!.json_schema!.schema!.required as string[]).includes("routes"),
    );
  });

  it("3 — valid CdfCreativeDirections object succeeds (exact contract)", () => {
    const parsed = parseOrRecoverStructuredOutput(JSON.stringify(VALID), {
      name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.ok(parsed.value && typeof parsed.value === "object");
    assert.ok(!Array.isArray(parsed.value));
    assert.equal(
      Array.isArray((parsed.value as { routes?: unknown }).routes) &&
        ((parsed.value as { routes: unknown[] }).routes.length === 3),
      true,
    );
  });

  it("4 — missing routes is rejected (no coercion / no synthetic routes)", () => {
    const missing = { name: "Territory A", creativeIdea: "solo" };
    const coerced = coerceValueTowardJsonSchema(
      missing,
      SCHEMA,
      CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
    );
    // Must not invent routes from a near-miss object.
    assert.equal(
      Array.isArray((coerced as { routes?: unknown })?.routes),
      false,
    );
    const parsed = parseOrRecoverStructuredOutput(JSON.stringify(missing), {
      name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.message, /missing required property 'routes'/i);
  });

  it("5 — bare array is rejected (no wrap into { routes: [...] })", () => {
    const arr = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    const coerced = coerceValueTowardJsonSchema(
      arr,
      SCHEMA,
      CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
    );
    assert.ok(Array.isArray(coerced));
    const parsed = parseOrRecoverStructuredOutput(JSON.stringify(arr), {
      name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.message, /expected type object.*got array|got array/i);
  });

  it("6 — does not instruct LaunchPlan steps for this contract", () => {
    const stamped = withStructuredOutputRequest(baseRequest(), {
      name: CDF_CREATIVE_DIRECTIONS_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    const prompt = String(stamped.payload.prompt ?? "");
    assert.doesNotMatch(prompt, /steps \(array of exactly 3\)/);
    assert.doesNotMatch(prompt, /Each step\.title/);
  });
});
