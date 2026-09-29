/**
 * Structured output schema end-to-end — one schema request == validate.
 * Generic: schemaId + sections[].id preservation (ApprovalDoc contract).
 */

import assert from "node:assert/strict";
import { CDF_STRUCTURED_APPROVAL_DOC_SCHEMA } from "../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import {
  listRegisteredCanonicalStructuredContractNames,
  resolveCdfStructuredOutputStamp,
} from "../../../src/platform/cdf/structured-output-contract";
import { resolveCdfPhaseExecutionContract } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/execution-contract";
import { validateAgainstJsonSchema } from "../../../src/platform/providers/tools/schema/json-schema-validator";
import { coerceValueTowardJsonSchema } from "../../../src/platform/providers/tools/structured/structured-output-coerce";
import { DOCUMENT_PLAN_STRUCTURED_SCHEMA } from "../../../src/platform/os/delivery/document-schemas";

describe("structured output schema end-to-end (M/N)", () => {
  const approvalSchema = CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<
    string,
    unknown
  >;

  it("N — valid approval doc passes", () => {
    const doc = {
      schemaId: "unagency.cdf.structured_approval.v1",
      title: "Brand platform",
      summary: "Summary",
      sections: [{ id: "s1", heading: "H1", body: "Body" }],
    };
    const result = validateAgainstJsonSchema(doc, approvalSchema);
    assert.equal(result.ok, true);
  });

  it("M — missing schemaId fails", () => {
    const doc = {
      title: "Brand platform",
      summary: "Summary",
      sections: [{ id: "s1", heading: "H1", body: "Body" }],
    };
    const result = validateAgainstJsonSchema(doc, approvalSchema);
    assert.equal(result.ok, false);
    assert.ok(
      String(result.error?.message ?? "").includes("schemaId"),
      String(result.error?.message),
    );
  });

  it("M — missing sections[].id fails", () => {
    const doc = {
      schemaId: "unagency.cdf.structured_approval.v1",
      title: "Brand platform",
      summary: "Summary",
      sections: [{ heading: "H1", body: "Body" }],
    };
    const result = validateAgainstJsonSchema(doc, approvalSchema);
    assert.equal(result.ok, false);
    assert.ok(
      String(result.error?.message ?? "").includes("id"),
      String(result.error?.message),
    );
  });

  it("provider request schema requires schemaId and sections[].id", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "brand-strategy",
      phaseId: "brand-platform",
    });
    assert.ok(contract);
    const stamp = resolveCdfStructuredOutputStamp({ contract: contract! });
    assert.ok(stamp, "structured stamp resolves for brand-strategy.brand-platform");
    const schema = stamp!.schema as Record<string, unknown>;
    const required = schema.required as string[];
    assert.ok(required.includes("schemaId"));
    assert.ok(required.includes("sections"));
    const props = schema.properties as Record<string, unknown>;
    const sections = props.sections as Record<string, unknown>;
    const items = sections.items as Record<string, unknown>;
    assert.ok((items.required as string[]).includes("id"));
  });

  it("registered structured contract names are non-empty", () => {
    const names = listRegisteredCanonicalStructuredContractNames();
    assert.ok(names.length > 0);
    assert.ok(names.includes("CdfStructuredApprovalDoc"));
  });

  it("N — coerce must not strip schemaId / sections[].id from ApprovalDoc", () => {
    const emission = {
      schemaId: "unagency.cdf.structured_approval.v1",
      title: "Brand platform",
      summary: "Summary",
      sections: [{ id: "s1", heading: "H1", body: "Body" }],
    };
    const coerced = coerceValueTowardJsonSchema(
      emission,
      approvalSchema,
      "CdfStructuredApprovalDoc",
    ) as Record<string, unknown>;
    assert.equal(coerced.schemaId, emission.schemaId);
    const sections = coerced.sections as Array<Record<string, unknown>>;
    assert.equal(sections[0]?.id, "s1");
    assert.equal(validateAgainstJsonSchema(coerced, approvalSchema).ok, true);
  });

  it("M — coerce must not invent ApprovalDoc fields from DocumentPlan-shaped JSON", () => {
    const nearMiss = {
      title: "Brand platform",
      summary: "Summary",
      sections: [{ heading: "H1", body: "Body" }],
    };
    const coerced = coerceValueTowardJsonSchema(
      nearMiss,
      approvalSchema,
      "CdfStructuredApprovalDoc",
    );
    const result = validateAgainstJsonSchema(coerced, approvalSchema);
    assert.equal(result.ok, false);
    assert.ok(
      String(result.error?.message ?? "").includes("schemaId"),
      String(result.error?.message),
    );
  });

  it("DocumentPlan coerce still remaps brochure-shaped JSON", () => {
    const nearMiss = {
      name: "Brochure",
      overview: "Overview",
      chapters: [{ title: "A", content: "Body A" }],
    };
    const coerced = coerceValueTowardJsonSchema(
      nearMiss,
      DOCUMENT_PLAN_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
      "DocumentPlan",
    ) as Record<string, unknown>;
    assert.equal(typeof coerced.title, "string");
    assert.equal(typeof coerced.summary, "string");
    assert.ok(Array.isArray(coerced.sections));
    assert.equal(
      validateAgainstJsonSchema(
        coerced,
        DOCUMENT_PLAN_STRUCTURED_SCHEMA as unknown as Record<string, unknown>,
      ).ok,
      true,
    );
  });

  it("N — job summary preserves emission; result payload must not rewrite as website", async () => {
    const { buildExecutionResultPayload } = await import(
      "../../../src/platform/api/services/execution-result-payload"
    );
    const emission = {
      schemaId: "unagency.cdf.structured_approval.v1",
      title: "Brand platform",
      summary: "Summary for Sunflower brand",
      sections: [{ id: "s1", heading: "Promise", body: "Warmth and growth" }],
    };
    const payload = buildExecutionResultPayload({
      status: "succeeded",
      jobSummary: {
        structuredEmissionData: emission,
        structuredContractName: "CdfStructuredApprovalDoc",
        resultText: "Sunflower brand platform prose that looks web-ish",
      },
    });
    assert.equal(payload.kind, "structured");
    const data = payload.data as Record<string, unknown>;
    assert.equal(data.schemaId, emission.schemaId);
    assert.equal(data.exportKind, undefined);
    assert.equal(data.stack, undefined);
    assert.ok(Array.isArray(data.sections));
    assert.equal((data.sections as Array<Record<string, unknown>>)[0]?.id, "s1");
  });
});
