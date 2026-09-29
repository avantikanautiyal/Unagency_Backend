/**
 * Deterministic provider-contract matrix for canonical CDF structured output.
 */

import assert from "node:assert/strict";
import { asProviderId } from "../../../../src/platform/core/identifiers";
import {
  CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  CDF_STRUCTURED_APPROVAL_DOC_SCHEMA,
} from "../../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import type { ProviderAdapterRequest } from "../../../../src/platform/providers/adapters/contracts/adapter-io";
import { toAdapterRequestFromExecution } from "../../../../src/platform/providers/common/to-adapter-request";
import { sampleRequest } from "../../../../src/platform/providers/runtime/testing";
import { withStructuredOutputRequest, attachStructuredOutput } from "../../../../src/platform/providers/tools/structured/structured-output-execution";
import {
  ACTIVE_STRUCTURED_CONTRACT_PROVIDERS,
  projectStructuredContractWire,
} from "../../../../src/platform/providers/tools/structured/structured-schema-wire-mapping";
import { captureRawProviderOutputContent } from "../../../../src/platform/providers/tools/structured/canonical-structured-contract-envelope";
import { attachProviderNetworkFailureMetadata } from "../../../../src/platform/providers/runtime/diagnostics/provider-error-extraction";

const SCHEMA = CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<
  string,
  unknown
>;

function buildStampedAdapterRequest(input: {
  providerId: string;
  modelId: string;
}): ProviderAdapterRequest {
  const prompt = "Draft approval document.";
  const exec = withStructuredOutputRequest(
    sampleRequest({
      requestId: "req_contract_matrix",
      providerId: input.providerId,
      payload: {
        prompt,
        text: prompt,
        input: prompt,
        messages: [{ role: "user", content: prompt }],
      },
      metadata: {
        directPassthrough: true,
        productAction: "direct_passthrough",
      },
    }) as never,
    {
      name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    },
  );
  return toAdapterRequestFromExecution({
    request: { ...exec, modelId: input.modelId } as never,
    canonicalProviderId: input.providerId,
    adapterId: input.providerId.replace("provider.", ""),
    nowIso: new Date().toISOString(),
  });
}

describe("canonical provider structured-contract matrix", () => {
  const matrixRows: string[] = [];

  for (const { providerId, modelId } of ACTIVE_STRUCTURED_CONTRACT_PROVIDERS) {
    it(`${providerId} / ${modelId} — wire + prompt + downgrade`, () => {
      const adapterRequest = buildStampedAdapterRequest({ providerId, modelId });
      const projection = projectStructuredContractWire({
        providerId,
        modelId,
        adapterRequest,
      });

      assert.equal(projection.promptContractInjected, true);
      assert.equal(projection.validation, "canonical_json_schema");

      if (providerId === "provider.openai") {
        assert.equal(projection.nativeEnforcement, "openai_json_schema_strict");
        assert.equal(projection.downgradeStatus, "none");
        const schema = projection.schemaOnWire as Record<string, unknown>;
        assert.equal(schema.type, "object");
        assert.ok(Array.isArray(schema.required));
        assert.ok((schema.required as string[]).includes("schemaId"));
      }

      if (providerId === "provider.anthropic") {
        assert.equal(projection.nativeEnforcement, "anthropic_tool_input_schema");
        assert.equal(projection.downgradeStatus, "none");
        const schema = projection.schemaOnWire as Record<string, unknown>;
        assert.equal(schema.type, "object");
      }

      if (providerId === "provider.gemini") {
        assert.equal(projection.nativeEnforcement, "gemini_response_json_schema");
        assert.equal(projection.downgradeStatus, "none");
        const schema = projection.schemaOnWire as Record<string, unknown>;
        assert.equal(schema.type, "object");
        assert.ok(Array.isArray(schema.required));
      }

      if (
        providerId === "provider.mistral" ||
        providerId === "provider.meta" ||
        providerId === "provider.deepseek" ||
        providerId === "provider.moonshot" ||
        providerId === "provider.xai" ||
        providerId === "provider.groq"
      ) {
        assert.equal(projection.nativeEnforcement, "prompt_and_validation_only");
        assert.equal(projection.downgradeStatus, "json_schema_to_json_object");
        assert.deepEqual(projection.schemaOnWire, { type: "json_object" });
      }

      matrixRows.push(
        [
          providerId,
          modelId,
          JSON.stringify(projection.schemaOnWire ? "schema" : projection.schemaOnWire),
          projection.promptContractInjected ? "yes" : "no",
          projection.nativeEnforcement,
          projection.downgradeStatus,
          projection.validation,
        ].join(" | "),
      );
    });
  }

  it("prints provider/model matrix summary", () => {
    assert.ok(matrixRows.length >= ACTIVE_STRUCTURED_CONTRACT_PROVIDERS.length);
  });

  it("surfaces raw provider content before validation on invalid structured output", () => {
    const attached = attachStructuredOutput(
      {
        requestId: "req_raw",
        success: true,
        status: "completed",
        finalProviderId: asProviderId("provider.gemini"),
        response: {
          requestId: "req_raw",
          providerId: asProviderId("provider.gemini"),
          output: {
            content: '{"overview":"missing required keys"}',
          },
          streamed: false,
          finishedAt: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      },
      {
        name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
        schema: SCHEMA,
        strict: true,
      },
      () => new Date().toISOString(),
    );
    assert.equal(attached.ok, true);
    if (!attached.ok) return;
    const output = attached.value.response?.output as Record<string, unknown>;
    assert.equal(
      output.providerRawContentBeforeValidation,
      '{"overview":"missing required keys"}',
    );
    assert.equal(output.structuredOutputValid, false);
  });

  it("records explicit no-HTTP-response network metadata for fetch failures", () => {
    const meta = attachProviderNetworkFailureMetadata({
      err: new TypeError("fetch failed"),
      providerId: "provider.meta",
      vendor: "meta",
      durationMs: 156,
    });
    assert.equal(meta.failureCategoryHint, "network");
    assert.equal(meta.noHttpResponse, true);
    assert.equal(meta.durationMs, 156);
    assert.equal(meta.providerId, "provider.meta");
  });

  it("captureRawProviderOutputContent preserves pre-normalization body", () => {
    assert.equal(
      captureRawProviderOutputContent({ content: '{"a":1}' }),
      '{"a":1}',
    );
  });
});
