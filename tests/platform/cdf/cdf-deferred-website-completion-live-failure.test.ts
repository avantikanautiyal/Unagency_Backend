/**
 * Live Web Tech → Landing Page failure regression:
 * materialization SUCCESS must become durable website completion + preview,
 * and observational SpecGuard NOT_AUTOMATED must not RETRY / MODEL_QUALITY_FAILURE.
 */

import assert from "node:assert/strict";
import { validateOutputContract } from "../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine";
import { gateStatusToEvaluationOutcome } from "../../../src/platform/os/evaluation/output-validation/quality-gate";
import { resolveBenchmarkOutcome } from "../../../src/platform/providers/routing/performance/benchmark/engine/benchmark-outcome-resolver";
import {
  hasWebsiteMaterializationEvidence,
  mergeWebsiteCanonicalCompletionStamp,
  resolveWebsiteCanonicalCompletionStamp,
} from "../../../src/platform/api/services/website-canonical-completion";
import { validationContextFromExecution } from "../../../src/platform/api/services/execution-governance-extras";
import {
  metadataRequiresCanonicalProductCompletion,
  shouldStampPresentationEligibility,
} from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import { presentationEligibilityFromExecutionSurfaces } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";

const WEBEXPORT_IDS = [
  "art_webexport0_380_1789852618388_0",
  "art_webexport0_380_1789852618388_1",
  "art_webexport2_381_1789852619192_2",
  "art_webexport2_381_1789852619192_3",
  "art_webexport4_382_1789852620035_4",
  "art_webexport4_382_1789852620035_5",
] as const;

const SAMPLE_WEB_PROJECT = Object.freeze({
  brandName: "Retail Co",
  stack: "html-static",
  entry: "index.html",
  files: [
    {
      path: "index.html",
      content:
        "<!doctype html><html><body><h1>Retail Co</h1><a href='#buy'>Shop</a></body></html>",
    },
  ],
  exportKind: "website",
  htmlArtifactId: WEBEXPORT_IDS[1],
  projectArtifactId: WEBEXPORT_IDS[0],
});

describe("CDF deferred_website live materialization → completion", () => {
  it("A–D. structured website surfaces + export artifacts resolve completion stamp", () => {
    // A–C are structured CDF phases (sitemap / page-structure / ui-routes) —
    // they remain structured and do not use this stamp. This asserts the
    // downstream product deliverable after materialization (D).
    const stamp = resolveWebsiteCanonicalCompletionStamp({
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
      },
      structuredData: SAMPLE_WEB_PROJECT,
      mediaArtifactIds: WEBEXPORT_IDS,
      resultData: {
        ...SAMPLE_WEB_PROJECT,
        routes: [
          {
            title: "Route 1",
            projectArtifactId: WEBEXPORT_IDS[0],
            htmlArtifactId: WEBEXPORT_IDS[1],
          },
          {
            title: "Route 2",
            projectArtifactId: WEBEXPORT_IDS[2],
            htmlArtifactId: WEBEXPORT_IDS[3],
          },
          {
            title: "Route 3",
            projectArtifactId: WEBEXPORT_IDS[4],
            htmlArtifactId: WEBEXPORT_IDS[5],
          },
        ],
      },
    });
    assert.ok(stamp);
    assert.equal(stamp.websiteCanonicalCompletionEstablished, true);
    assert.equal(stamp.projectArtifactId, WEBEXPORT_IDS[0]);
    assert.equal(stamp.htmlArtifactId, WEBEXPORT_IDS[1]);
    assert.equal(stamp.websitePreviewArtifactId, WEBEXPORT_IDS[1]);
    assert.equal(stamp.websitePreviewRepresentation, "html_artifact");
    // Never promote art_webexport to cdfart identity.
    assert.equal(String(stamp.projectArtifactId).startsWith("cdfart_"), false);
    assert.equal(
      hasWebsiteMaterializationEvidence({
        mediaArtifactIds: WEBEXPORT_IDS,
        resultData: SAMPLE_WEB_PROJECT,
      }),
      true,
    );
  });

  it("E–G. canonical website completion stamp → presentation AVAILABLE + preview resolvable", () => {
    const stamp = resolveWebsiteCanonicalCompletionStamp({
      mediaArtifactIds: WEBEXPORT_IDS,
      resultData: SAMPLE_WEB_PROJECT,
    });
    assert.ok(stamp);
    const merged = mergeWebsiteCanonicalCompletionStamp(
      { ...SAMPLE_WEB_PROJECT },
      stamp,
    );
    assert.equal(merged.websiteCanonicalCompletionEstablished, true);
    assert.equal(merged.htmlArtifactId, WEBEXPORT_IDS[1]);
    // Must not invent cdfArtifactId from art_webexport
    assert.equal(
      typeof merged.cdfArtifactId === "string" &&
        String(merged.cdfArtifactId).startsWith("art_"),
      false,
    );

    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_369_test",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true, // even if wrongly true, website stamp wins
      resultData: merged,
      metadata: {
        outputKind: "deferred_website",
        service: "website",
        ...stamp,
      },
      artifactIds: WEBEXPORT_IDS,
    });
    assert.equal(elig.status, "AVAILABLE");
    assert.equal(elig.outcomePlanes?.canonicalCompletion, "CANONICAL_ACCEPTED");
  });

  it("H/I. SpecGuard + governance: materialization evidence → completionAllowed (no RETRY)", () => {
    const ctx = validationContextFromExecution({
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        industry: "Retail & E-commerce",
      },
      mediaArtifactIds: [...WEBEXPORT_IDS],
      resultData: { ...SAMPLE_WEB_PROJECT },
      jobSummary: { structuredData: SAMPLE_WEB_PROJECT },
    });
    assert.equal(ctx.buildSucceeded, true);
    assert.deepEqual(ctx.runtimeErrors, []);

    const validation = validateOutputContract({
      organizationId: "org_test",
      executionId: "exec_369_test",
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      industry: "Retail & E-commerce",
      preview: "<html><body>Retail Co landing</body></html>",
      structuredData: SAMPLE_WEB_PROJECT,
      mediaArtifactIds: [...WEBEXPORT_IDS],
      buildSucceeded: ctx.buildSucceeded,
      buildOutput: ctx.buildOutput,
      runtimeErrors: ctx.runtimeErrors,
      nowIso: () => "2026-09-20T00:00:00.000Z",
      createId: (p) => `${p}_test`,
    });
    assert.ok(validation);
    assert.equal(validation.completionAllowed, true);
    assert.notEqual(validation.status, "FAIL");
    assert.notEqual(
      gateStatusToEvaluationOutcome(validation.status),
      "RETRY_REQUIRED",
    );

    const outcome = resolveBenchmarkOutcome({
      skippedPreFlight: false,
      validation,
      compatibility: {
        validity: { validForPureModelComparison: true },
        executionCapabilityAvailable: true,
        outcomeIfSkipped: "VALIDATION_UNAVAILABLE",
      },
    });
    assert.notEqual(outcome, "MODEL_QUALITY_FAILURE");
  });

  it("I2. observational quality without materialization still fails closed on build NOT_AUTOMATED", () => {
    const validation = validateOutputContract({
      organizationId: "org_test",
      executionId: "exec_no_materialize",
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      preview: "<html></html>",
      structuredData: {
        brandName: "X",
        stack: "html-static",
        files: [{ path: "index.html", content: "<html></html>" }],
      },
      mediaArtifactIds: [],
      // no buildSucceeded — live failure mode
      nowIso: () => "2026-09-20T00:00:00.000Z",
      createId: (p) => `${p}_test`,
    });
    assert.ok(validation);
    assert.equal(validation.completionAllowed, false);
    assert.equal(
      gateStatusToEvaluationOutcome(validation.status),
      "RETRY_REQUIRED",
    );
  });

  it("J. genuine materialization/preview identity failure still fails closed", () => {
    assert.equal(
      resolveWebsiteCanonicalCompletionStamp({
        metadata: { outputKind: "deferred_website" },
        mediaArtifactIds: [],
        resultData: { title: "no exports" },
      }),
      null,
    );

    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_fail",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: false,
      resultData: {
        websiteCanonicalCompletionEstablished: true,
        websitePreviewRepresentation: "html_artifact",
        projectArtifactId: "art_webexport_zip_only",
        // htmlArtifactId intentionally missing
      },
      metadata: { outputKind: "deferred_website" },
      artifactIds: ["art_webexport_zip_only"],
    });
    assert.equal(elig.status, "FAILED");
    assert.match(
      String(elig.reason ?? ""),
      /website_preview_representation_missing/,
    );
  });

  it("deferred_website must not require image canonical product completion", () => {
    assert.equal(
      metadataRequiresCanonicalProductCompletion({
        outputKind: "deferred_website",
        cdfSessionId: "cdf_session",
        cdfPhaseId: "homepage",
        cdfExecutionStrategy: "canonical",
        cdfServiceId: "web-tech",
      }),
      false,
    );
  });

  it("restart/hydration: completion + preview resolve from durable stamps alone", () => {
    const stamp = resolveWebsiteCanonicalCompletionStamp({
      mediaArtifactIds: WEBEXPORT_IDS,
      resultData: SAMPLE_WEB_PROJECT,
    });
    assert.ok(stamp);
    // Simulate post-restart: only persisted metadata + result.data (no live session).
    const hydratedMeta = mergeWebsiteCanonicalCompletionStamp(
      {
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
      },
      stamp,
    );
    const hydratedResult = mergeWebsiteCanonicalCompletionStamp(
      { ...SAMPLE_WEB_PROJECT },
      stamp,
    );
    assert.equal(
      hasWebsiteMaterializationEvidence({
        metadata: hydratedMeta,
        resultData: hydratedResult,
        mediaArtifactIds: WEBEXPORT_IDS,
      }),
      true,
    );
    const elig = presentationEligibilityFromExecutionSurfaces({
      executionId: "exec_369_hydrated",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: false,
      resultData: hydratedResult,
      metadata: hydratedMeta,
      artifactIds: WEBEXPORT_IDS,
    });
    assert.equal(elig.status, "AVAILABLE");
    assert.equal(hydratedResult.htmlArtifactId, WEBEXPORT_IDS[1]);
    assert.equal(hydratedResult.projectArtifactId, WEBEXPORT_IDS[0]);
  });

  it("shouldStampPresentationEligibility: deferred_website stamps even when requiresCanonical is false", () => {
    const meta = {
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      cdfSessionId: "cdf_test",
      cdfPhaseId: "generate_website",
    };
    assert.equal(metadataRequiresCanonicalProductCompletion(meta), false);
    assert.equal(shouldStampPresentationEligibility(meta, null), true);
    assert.equal(
      shouldStampPresentationEligibility(
        { outputKind: "deferred_website" },
        { websiteCanonicalCompletionEstablished: true },
      ),
      true,
    );
  });
});
