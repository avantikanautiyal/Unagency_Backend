/**
 * Wireframe typed structured-output contract — generic registry resolution.
 * Same declarative pattern as CdfWebsitePageStructure (no phase-ID runtime branches).
 */

import assert from "node:assert/strict";
import { asProviderId } from "../../../src/platform/core/identifiers";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import {
  resolveCdfStructuredOutputStamp,
  resolveStructuredOutputSchemaByContractName,
  stampCanonicalStructuredOutputMetadata,
  assertCanonicalStructuredSchemaBeforeProvider,
  hasUsableStructuredOutputSchema,
} from "../../../src/platform/cdf/structured-output-contract";
import {
  CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
  CDF_WEBSITE_WIREFRAME_SCHEMA,
  CDF_WEBSITE_WIREFRAME_SCHEMA_ID,
} from "../../../src/platform/os/delivery/cdf-website-wireframe-schemas";
import {
  CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  CDF_STRUCTURED_APPROVAL_DOC_SCHEMA,
} from "../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import { validateAgainstJsonSchema } from "../../../src/platform/providers/tools/schema/json-schema-validator";
import { coerceValueTowardJsonSchema } from "../../../src/platform/providers/tools/structured/structured-output-coerce";
import { withStructuredOutputRequest } from "../../../src/platform/providers/tools/structured/structured-output-execution";
import { cdfExecutionRequiresMediaArtifact } from "../../../src/platform/cdf/execution-authority";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";

const VALID_WIREFRAME = Object.freeze({
  schemaId: CDF_WEBSITE_WIREFRAME_SCHEMA_ID,
  type: "website_wireframe",
  deliverable: "website-wireframe",
  title: "Landing wireframe",
  summary: "Hero + features layout for UI routes",
  pages: [
    {
      id: "home",
      label: "Home",
      path: "/",
      blocks: [
        {
          id: "home_hero",
          region: "hero",
          purpose: "Primary CTA",
          hierarchy: "primary",
        },
        {
          id: "home_features",
          region: "features",
          purpose: "Capability grid",
        },
      ],
    },
  ],
  openItemsForApproval: ["Confirm hero weight"],
});

/** Live exec_53 shape — website_wireframe invention missing blocks / ApprovalDoc sections. */
const LIVE_EXEC53_LIKE = Object.freeze({
  artifactKey: "web-tech.wireframe",
  artifactType: "structured_doc",
  schemaId: "unagency.cdf.website_wireframe.v1",
  deliverable: "Website Wireframe",
  title: "Corporate Landing Page Wireframe",
  type: "website_wireframe",
  fidelity: "mid-fidelity",
  summary: "A mid-fidelity wireframe...",
  sourceAnchors: {},
  gridSystem: {},
  pages: [{ id: "landing-page", label: "Corporate Landing Page", path: "/" }],
});

describe("CdfWebsiteWireframe contract (generic)", () => {
  it("1. wireframe resolves declared CdfWebsiteWireframe — not ApprovalDoc", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "web-tech",
      phaseId: "wireframe",
    });
    assert.ok(contract);
    assert.equal(
      contract!.structuredOutputContract?.name,
      CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
    );
    assert.notEqual(
      contract!.structuredOutputContract?.name,
      CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
    );
    assert.equal(contract!.artifactKey, "web-tech.wireframe");
    assert.equal(contract!.generationModality, "structured");
  });

  it("2. catalog resolves schema by contract name", () => {
    const stamp = resolveStructuredOutputSchemaByContractName(
      CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
    );
    assert.ok(stamp);
    assert.equal(stamp!.name, CDF_WEBSITE_WIREFRAME_CONTRACT_NAME);
    assert.equal(
      (stamp!.schema as { required?: string[] }).required?.includes("pages"),
      true,
    );
    assert.equal(
      (stamp!.schema as { required?: string[] }).required?.includes("schemaId"),
      true,
    );
  });

  it("3. stampCanonicalStructuredOutputMetadata stamps wireframe schema", () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "wireframe",
      cdfOmitStructuredOutput: true,
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
    );
    assert.notEqual(
      (stamped.structuredOutput as { name?: string }).name,
      CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
    );
    assert.equal(
      assertCanonicalStructuredSchemaBeforeProvider(stamped).ok,
      true,
    );
  });

  it("4. valid wireframe payload passes schema validation", () => {
    const result = validateAgainstJsonSchema(
      VALID_WIREFRAME,
      CDF_WEBSITE_WIREFRAME_SCHEMA as unknown as Record<string, unknown>,
    );
    assert.equal(result.ok, true);
  });

  it("5. live exec_53-like payload fails wireframe schema (missing blocks)", () => {
    const result = validateAgainstJsonSchema(
      LIVE_EXEC53_LIKE,
      CDF_WEBSITE_WIREFRAME_SCHEMA as unknown as Record<string, unknown>,
    );
    assert.equal(result.ok, false);
    const msg = String(result.error?.message ?? "");
    assert.ok(
      msg.includes("blocks") ||
        msg.includes("unexpected property") ||
        msg.includes("missing required"),
      msg,
    );
  });

  it("6. live exec_53-like payload fails ApprovalDoc (missing sections) — prior contract", () => {
    const before = validateAgainstJsonSchema(
      LIVE_EXEC53_LIKE,
      CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<string, unknown>,
    );
    assert.equal(before.ok, false);
    assert.ok(
      String(before.error?.message ?? "").includes("sections"),
      String(before.error?.message),
    );
    const coerced = coerceValueTowardJsonSchema(
      LIVE_EXEC53_LIKE,
      CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<string, unknown>,
      "CdfStructuredApprovalDoc",
    );
    const after = validateAgainstJsonSchema(
      coerced,
      CDF_STRUCTURED_APPROVAL_DOC_SCHEMA as unknown as Record<string, unknown>,
    );
    assert.equal(after.ok, false);
    assert.ok(
      String(after.error?.message ?? "").includes("sections"),
      String(after.error?.message),
    );
  });

  it("7. coerce does not invent wireframe pages from ApprovalDoc-shaped JSON", () => {
    const nearMiss = {
      schemaId: CDF_WEBSITE_WIREFRAME_SCHEMA_ID,
      title: "Wireframe",
      summary: "Summary",
      sections: [{ id: "s1", heading: "Hero", body: "Hero body" }],
    };
    const coerced = coerceValueTowardJsonSchema(
      nearMiss,
      CDF_WEBSITE_WIREFRAME_SCHEMA as unknown as Record<string, unknown>,
      CDF_WEBSITE_WIREFRAME_CONTRACT_NAME,
    ) as Record<string, unknown>;
    assert.equal(coerced.schemaId, CDF_WEBSITE_WIREFRAME_SCHEMA_ID);
    assert.equal(coerced.pages, undefined);
    const result = validateAgainstJsonSchema(
      coerced,
      CDF_WEBSITE_WIREFRAME_SCHEMA as unknown as Record<string, unknown>,
    );
    assert.equal(result.ok, false);
  });

  it("8. directPassthrough still receives schema prompt guidance for wireframe", () => {
    const stamp = resolveCdfStructuredOutputStamp({
      serviceId: "web-tech",
      phaseId: "wireframe",
    });
    assert.ok(stamp);
    const base: ProviderExecutionRequest = {
      requestId: "req_wf_instr",
      providerId: asProviderId("provider.openai"),
      capabilityId: "text.generate" as never,
      payload: {
        prompt: "Produce wireframe",
        text: "Produce wireframe",
        input: "Produce wireframe",
      },
      metadata: {
        directPassthrough: true,
        productAction: "direct_passthrough",
        cdfServiceId: "web-tech",
        cdfPhaseId: "wireframe",
      },
      options: {},
    };
    const stamped = withStructuredOutputRequest(base, {
      name: stamp!.name,
      schema: stamp!.schema,
      strict: true,
    });
    const prompt = String(stamped.payload.prompt ?? "");
    assert.ok(
      prompt.includes("CdfWebsiteWireframe") ||
        prompt.includes("Required top-level keys"),
      prompt.slice(0, 400),
    );
    assert.ok(
      prompt.includes("schemaId") || prompt.includes("pages"),
      prompt.slice(0, 400),
    );
    assert.ok(
      !prompt.includes("steps (array of exactly 3)"),
      prompt.slice(0, 400),
    );
  });

  it("9. resolveCdfStructuredOutputStamp matches registry declaration", () => {
    const stamp = resolveCdfStructuredOutputStamp({
      serviceId: "web-tech",
      phaseId: "wireframe",
    });
    assert.ok(stamp);
    assert.equal(stamp!.name, CDF_WEBSITE_WIREFRAME_CONTRACT_NAME);
    assert.equal(stamp!.strict, true);
  });

  it("10. wireframe structured phase does not require media artifact", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "web-tech",
      phaseId: "wireframe",
    });
    assert.ok(contract);
    assert.equal(cdfExecutionRequiresMediaArtifact(contract!), false);
  });
});
