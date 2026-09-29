/**
 * Page Structure typed structured-output contract — generic registry resolution.
 * No serviceId / phaseId / provider runtime branches under test as the fix surface.
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import {
  resolveCdfStructuredOutputStamp,
  resolveStructuredOutputSchemaByContractName,
  stampCanonicalStructuredOutputMetadata,
  assertCanonicalStructuredSchemaBeforeProvider,
  hasUsableStructuredOutputSchema,
} from "../../../src/platform/cdf/structured-output-contract";
import {
  CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
  CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA,
  CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA_ID,
} from "../../../src/platform/os/delivery/cdf-website-page-structure-schemas";
import { CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME } from "../../../src/platform/os/delivery/cdf-structured-approval-schemas";
import { validateAgainstJsonSchema } from "../../../src/platform/providers/tools/schema/json-schema-validator";
import { resolveUpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/resolve-upstream-artifact-context";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";
import { cdfExecutionRequiresMediaArtifact } from "../../../src/platform/cdf/execution-authority";

const VALID_PAGE_STRUCTURE = Object.freeze({
  schemaId: CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA_ID,
  type: "page_structure",
  deliverable: "website-page-structure",
  title: "Page structure",
  summary: "Home and About expanded into sections",
  pages: [
    {
      id: "home",
      label: "Home",
      path: "/",
      purpose: "Landing",
      sections: [
        {
          id: "home_hero",
          heading: "Hero",
          purpose: "Value proposition",
          order: 0,
          contentBlocks: [
            {
              id: "home_hero_cta",
              kind: "cta",
              summary: "Primary CTA",
              order: 0,
            },
          ],
        },
        {
          id: "home_features",
          heading: "Features",
          order: 1,
        },
      ],
    },
    {
      id: "about",
      label: "About",
      path: "/about",
      sections: [{ id: "about_intro", heading: "Introduction", order: 0 }],
    },
  ],
  pageCount: 2,
  openItemsForApproval: ["Confirm feature count"],
});

describe("CdfWebsitePageStructure contract (generic)", () => {
  it("1. page-structure resolves its declared structured-output contract", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "web-tech",
      phaseId: "page-structure",
    });
    assert.ok(contract);
    assert.equal(
      contract!.structuredOutputContract?.name,
      CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
    );
    const stamp = resolveCdfStructuredOutputStamp({ contract: contract! });
    assert.ok(stamp);
    assert.equal(stamp!.name, CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME);
  });

  it("2. page-structure does not resolve to CdfStructuredApprovalDoc", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "web-tech",
      phaseId: "page-structure",
    });
    assert.notEqual(
      contract!.structuredOutputContract?.name,
      CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME,
    );
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "page-structure",
      cdfOmitStructuredOutput: true,
    });
    assert.equal(hasUsableStructuredOutputSchema(stamped), true);
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
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

  it("3. valid Page Structure payload satisfies its schema", () => {
    const schema = resolveStructuredOutputSchemaByContractName(
      CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
    );
    assert.ok(schema);
    const result = validateAgainstJsonSchema(
      VALID_PAGE_STRUCTURE,
      schema!.schema as never,
    );
    assert.equal(result.ok, true);
  });

  it("4. malformed Page Structure payload fails closed", () => {
    const malformedApprovalShape = {
      schemaId: "unagency.cdf.structured_approval.v1",
      title: "Wrong shape",
      summary: "Approval doc masquerading as page structure",
      sections: [{ heading: "No id", body: "Missing id" }],
    };
    const result = validateAgainstJsonSchema(
      malformedApprovalShape,
      CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA as never,
    );
    assert.equal(result.ok, false);
  });

  it("5. Sitemap X@V preserved as exact upstream input", () => {
    const exactId = "cdfart_mu6rqa5r_b_web-tech-sitemap";
    const upstream: UpstreamArtifactContext = {
      artifactId: exactId,
      version: 1,
      artifactKey: "web-tech.sitemap",
      phaseId: "sitemap",
      role: "approved_content",
      status: "approved",
      schemaVersion: "1",
      data: {
        title: "Sitemap",
        siteHierarchy: [{ id: "home", label: "Home" }],
        globalNavigation: [{ label: "Home" }],
        pageCount: 1,
      },
      lineage: { sourceArtifacts: [] },
      sessionRole: "approved",
      required: true,
    };
    const resolved = resolveUpstreamArtifactContext({ upstream });
    assert.equal(resolved.artifactId, exactId);
    assert.equal(resolved.artifactVersion, 1);
    assert.equal(resolved.semanticProjection.status, "resolved");
  });

  it("6–7. stamp + schema gate ready before canonical ingest (validation gate)", () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "web-tech",
      cdfPhaseId: "page-structure",
    });
    const gate = assertCanonicalStructuredSchemaBeforeProvider(stamped);
    assert.equal(gate.ok, true);
    // Canonical ArtifactVersion creation remains gated on structured validation
    // success at provider attach — schema must be present and typed.
    assert.equal(
      (stamped.structuredOutput as { name?: string }).name,
      CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
    );
    assert.ok(
      (stamped.structuredOutput as { schema?: unknown }).schema &&
        typeof (stamped.structuredOutput as { schema?: unknown }).schema ===
          "object",
    );
  });

  it("8. downstream Wireframe receives exact Page Structure X@V as upstream", () => {
    const exactId = "cdfart_page_structure_exact";
    const upstream: UpstreamArtifactContext = {
      artifactId: exactId,
      version: 1,
      artifactKey: "web-tech.page-structure",
      phaseId: "page-structure",
      role: "approved_content",
      status: "approved",
      schemaVersion: "1",
      data: { ...VALID_PAGE_STRUCTURE },
      lineage: {
        sourceArtifacts: [
          {
            artifactId: "cdfart_mu6rqa5r_b_web-tech-sitemap",
            version: 1,
            artifactKey: "web-tech.sitemap",
            relationship: "upstream_dependency",
          },
        ],
      },
      sessionRole: "approved",
      required: true,
    };
    const resolved = resolveUpstreamArtifactContext({ upstream });
    assert.equal(resolved.artifactId, exactId);
    assert.equal(resolved.artifactVersion, 1);
    assert.equal(resolved.sourcePhase, "page-structure");
    assert.equal(resolved.semanticProjection.status, "resolved");
  });

  it("9. no serviceId/phaseId/provider/model runtime branches in schema registry path", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/structured-output-contract.ts",
      ),
      "utf8",
    );
    // Registration is by contract name constant — not if (phaseId === ...).
    assert.match(src, /CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME/);
    assert.doesNotMatch(
      src,
      /if\s*\(\s*(serviceId|phaseId|artifactKey)\s*===/,
    );
    const schemaSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/os/delivery/cdf-website-page-structure-schemas.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(schemaSrc, /openai|gpt-|provider\./i);
  });

  it("10. structured page-structure remains media-N/A", () => {
    assert.equal(
      cdfExecutionRequiresMediaArtifact({
        cdfExecutionAuthorityApplied: true,
        cdfAuthorityGenerationModality: "structured",
        cdfAuthorityOutputKind: "text",
        skipOutputRequirements: true,
        cdfAuthorityStructuredOutputName: CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME,
      }),
      false,
    );
  });

  it("11. image/video phases remain media-required", () => {
    assert.equal(
      cdfExecutionRequiresMediaArtifact({
        cdfAuthorityGenerationModality: "image",
      }),
      true,
    );
    assert.equal(
      cdfExecutionRequiresMediaArtifact({
        cdfAuthorityGenerationModality: "video",
      }),
      true,
    );
  });

  it("declared page-structure contract wins over generic ApprovalDoc stamp", () => {
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
