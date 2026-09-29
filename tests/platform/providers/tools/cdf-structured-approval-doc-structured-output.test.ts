/**
 * CdfStructuredApprovalDoc — canonical envelope + prompt contract under directPassthrough.
 *
 * Regression: directPassthrough skipped schema instructions and fell through to
 * LaunchPlan `steps` copy, so Gemini emitted objects missing schemaId/title/summary/sections.
 */

import assert from "node:assert/strict";
import { asProviderId } from "../../../../src/platform/core/identifiers";
import {
  CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  CDF_STRUCTURED_APPROVAL_DOC_SCHEMA,
  CDF_STRUCTURED_APPROVAL_DOC_SCHEMA_ID,
} from "../../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import type { ProviderExecutionRequest } from "../../../../src/platform/providers/runtime/contracts/provider-execution-request";
import {
  parseOrRecoverStructuredOutput,
  withStructuredOutputRequest,
} from "../../../../src/platform/providers/tools/structured/structured-output-execution";

const SCHEMA = CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<
  string,
  unknown
>;

function baseRequest(prompt = "Draft the brand platform approval document."): ProviderExecutionRequest {
  return {
    requestId: "req_cdf_approval_doc_test",
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

describe("CdfStructuredApprovalDoc structured-output (canonical envelope)", () => {
  it("directPassthrough injects approval-doc schema guidance, not LaunchPlan steps", () => {
    const stamped = withStructuredOutputRequest(baseRequest(), {
      name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    const prompt = String(stamped.payload.prompt ?? "");
    assert.match(prompt, /CdfStructuredApprovalDoc/);
    assert.match(prompt, /schemaId/);
    assert.match(prompt, /sections/);
    assert.match(prompt, /Exact JSON schema:/);
    assert.doesNotMatch(prompt, /Required top-level keys ONLY: title.*steps/i);
    assert.doesNotMatch(prompt, /Each step\.title/);

    const envelope = stamped.metadata?.canonicalStructuredContractEnvelope as
      | { schema?: Record<string, unknown> }
      | undefined;
    assert.ok(envelope?.schema);
    assert.deepEqual(
      (envelope!.schema!.required as string[]).sort(),
      ["schemaId", "sections", "summary", "title"].sort(),
    );

    const rf = stamped.payload.response_format as {
      json_schema?: { schema?: Record<string, unknown> };
    };
    assert.ok(
      Array.isArray(rf?.json_schema?.schema?.required) &&
        (rf!.json_schema!.schema!.required as string[]).includes("schemaId"),
    );
  });

  it("valid approval doc passes canonical validation", () => {
    const valid = {
      schemaId: CDF_STRUCTURED_APPROVAL_DOC_SCHEMA_ID,
      title: "Brand Platform",
      summary: "Summary",
      sections: [{ id: "s1", heading: "Purpose", body: "Body" }],
    };
    const parsed = parseOrRecoverStructuredOutput(JSON.stringify(valid), {
      name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
      schema: SCHEMA,
      strict: true,
    });
    assert.equal(parsed.ok, true);
  });

  it("missing schemaId/title/summary/sections fails closed", () => {
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify({ overview: "wrong shape" }),
      {
        name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
        schema: SCHEMA,
        strict: true,
      },
    );
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.message, /schemaId|title|summary|sections|required/i);
  });
});
