import assert from "node:assert/strict";
import {
  assertCanonicalStructuredSchemaBeforeProvider,
  hasUsableStructuredOutputSchema,
  resolveCdfStructuredOutputStamp,
  stampCanonicalStructuredOutputMetadata,
} from "../../../src/platform/cdf/structured-output-contract";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME } from "../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import { CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME } from "../../../src/platform/os/delivery/cdf-website-page-structure-schemas";

const REPRESENTATIVE_STRUCTURED_APPROVAL: ReadonlyArray<{
  serviceId: string;
  phaseId: string;
  artifactKey: string;
  contractName: string;
}> = [
  {
    serviceId: "web-tech",
    phaseId: "page-structure",
    artifactKey: "web-tech.page-structure",
    contractName: CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
  },
  {
    serviceId: "brand-strategy",
    phaseId: "brand-platform",
    artifactKey: "brand-strategy.brand-platform",
    contractName: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  },
  {
    serviceId: "ad-campaigns",
    phaseId: "campaign-strategy",
    artifactKey: "ad-campaigns.campaign-strategy",
    contractName: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  },
  {
    serviceId: "emailers",
    phaseId: "full-copy",
    artifactKey: "emailers.full-copy",
    contractName: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
  },
];

describe("CDF structured-approval emission (generic)", () => {
  for (const row of REPRESENTATIVE_STRUCTURED_APPROVAL) {
    it(`${row.serviceId}.${row.phaseId} declares contract and stamps schema`, () => {
      const contract = resolveCdfPhaseExecutionContract({
        serviceId: row.serviceId,
        phaseId: row.phaseId,
      });
      assert.ok(contract);
      assert.equal(contract!.executionStrategy, "canonical");
      assert.equal(contract!.generationModality, "structured");
      assert.equal(contract!.artifactKey, row.artifactKey);
      assert.equal(
        contract!.structuredOutputContract?.name,
        row.contractName,
      );

      const stamp = resolveCdfStructuredOutputStamp({ contract: contract! });
      assert.ok(stamp);
      assert.equal(stamp!.name, row.contractName);
      assert.ok(stamp!.schema && typeof stamp!.schema === "object");

      const meta = stampCanonicalStructuredOutputMetadata({
        cdfServiceId: row.serviceId,
        cdfPhaseId: row.phaseId,
        // Early-phase omit must not block phase-contract stamping.
        cdfOmitStructuredOutput: true,
      });
      assert.equal(hasUsableStructuredOutputSchema(meta), true);
      assert.equal(
        (meta.structuredOutput as { name?: string }).name,
        row.contractName,
      );
      assert.equal(assertCanonicalStructuredSchemaBeforeProvider(meta).ok, true);
    });
  }

  it("never invents WebsiteRoutes / DocumentPlan for early structured-approval", () => {
    const meta = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "page-structure",
      cdfOmitStructuredOutput: true,
      service: "web-tech",
      outputKind: "text",
    });
    const name = (meta.structuredOutput as { name?: string }).name;
    assert.equal(name, CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME);
    assert.notEqual(name, "WebsiteRoutes");
    assert.notEqual(name, "DocumentPlan");
    assert.notEqual(name, "EmailPlan");
    assert.notEqual(name, CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME);
  });

  it("declared page-structure contract wins over generic CdfStructuredApprovalDoc stamp", () => {
    const meta = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "page-structure",
      structuredOutput: {
        name: CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
        schema: { type: "object" },
        strict: true,
      },
    });
    assert.equal(
      (meta.structuredOutput as { name?: string }).name,
      CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
    );
  });
});
