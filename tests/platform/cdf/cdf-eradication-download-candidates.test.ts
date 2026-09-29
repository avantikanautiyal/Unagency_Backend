/**
 * Architectural eradication — download strangler + candidate-without-AV.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  evaluatePackagingDownloadEligibility,
  evaluateSocialMediaDownloadEligibility,
  isPackagingCanonicalDownloadEnabled,
  isSocialMediaCanonicalDownloadEnabled,
} from "../../../src/platform/cdf";

describe("CDF eradication tranche B/C/D", () => {
  it("B — canonical download env helpers always true (strangler deleted)", () => {
    delete process.env.CDF_SOCIAL_MEDIA_CANONICAL_DOWNLOAD;
    delete process.env.CDF_PACKAGING_CANONICAL_DOWNLOAD;
    expect(isSocialMediaCanonicalDownloadEnabled()).toBe(true);
    expect(isPackagingCanonicalDownloadEnabled()).toBe(true);
  });

  it("B — missing ArtifactVersion pin fails closed (no art_*)", () => {
    const sm = evaluateSocialMediaDownloadEligibility({
      label: "Download",
      format: "png",
    });
    expect(sm.decision).toBe("no_canonical_artifact");
    expect(
      (sm as { silentLegacyFallbackForbidden?: boolean })
        .silentLegacyFallbackForbidden,
    ).toBe(true);

    const pk = evaluatePackagingDownloadEligibility({
      label: "Download Packaging Files",
      format: "png",
    });
    expect(pk.decision).toBe("no_canonical_artifact");
    expect(
      (pk as { silentLegacyFallbackForbidden?: boolean })
        .silentLegacyFallbackForbidden,
    ).toBe(true);
  });

  it("B — preferLegacyDownload cannot force art_*", () => {
    const sm = evaluateSocialMediaDownloadEligibility({
      label: "Download",
      format: "png",
      pin: {
        artifactId: "cdfart_x",
        artifactVersion: 1,
        artifactKey: "social-media.output",
        validationStatus: "passed",
        runtimePath: "canonical",
        preferLegacyDownload: true,
      },
    });
    expect(sm.decision).toBe("unsupported_representation");
    expect(
      (sm as { silentLegacyFallbackForbidden?: boolean })
        .silentLegacyFallbackForbidden,
    ).toBe(true);
  });

  it("D — promptPreview helper rejects CMR placeholder (dispatch)", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-create-dispatch.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/function promptPreviewForClient/);
    expect(src).toMatch(/unagency:canonical_model_request/);
    expect(src).toMatch(/promptPreview: promptPreviewForClient\(req\.prompt\)/);
    expect(src).not.toMatch(/promptPreview: req\.prompt\.slice\(0, 120\)/);
  });

  it("B — ingest attach never stamps cdfPreferLegacyDownload", () => {
    for (const rel of [
      "../../../src/platform/cdf/social-media-runtime/ingest-bridge.ts",
      "../../../src/platform/cdf/packaging-runtime/ingest-bridge.ts",
    ]) {
      const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
      expect(src).not.toMatch(/cdfPreferLegacyDownload:\s*true/);
      expect(src).toMatch(/cdfDownloadEligible:\s*true/);
    }
  });
});
