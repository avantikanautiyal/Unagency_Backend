/**
 * A generated creative is never hidden or failed by a save / QA / preview check
 * (user rule, Nov 12 2026). The check becomes a note or an internal log.
 */

import {
  applyCdfCanonicalCompletionIngest,
  canonicalSaveFailedStamps,
  CANONICAL_SAVE_FAILED_NOTE,
  executionHasGeneratedMedia,
} from "../../../src/platform/api/services/execution-cdf-canonical-ingest";

const events: string[] = [];
const log = (event: string) => {
  events.push(event);
};

// A canonical image phase whose provider output has no structured candidate:
// the inner ingest blocks completion ("canonical_artifact_missing").
const canonicalImageMeta = {
  cdfSessionId: "cdf_s1",
  cdfPhaseId: "output",
  cdfServiceId: "social-media",
  cdfExecutionStrategy: "canonical",
  cdfGenerationModality: "image",
  cdfRequiresCanonicalCompletion: true,
  requiresCanonicalProductCompletion: true,
};

describe("a failed save never hides a generated creative", () => {
  beforeEach(() => {
    events.length = 0;
  });

  it("recognises real media ids", () => {
    expect(executionHasGeneratedMedia(["art_syncimg_1_0"])).toBe(true);
    expect(executionHasGeneratedMedia([])).toBe(false);
    expect(executionHasGeneratedMedia(["cdfart_x"])).toBe(false);
  });

  it("stamps a save-failed note, never a block", () => {
    const stamps = canonicalSaveFailedStamps("ingest_error");
    expect(stamps).toMatchObject({
      cdfCanonicalSaveFailed: true,
      cdfCanonicalSaveFailReason: "ingest_error",
      cdfCanonicalSaveNote: CANONICAL_SAVE_FAILED_NOTE,
      productCompletionBlocked: false,
    });
  });

  it("blocked save + image → step stays succeeded with the note", async () => {
    const out = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: { ...canonicalImageMeta },
      structuredCandidate: null,
      mediaArtifactIds: ["art_syncimg_1_0"],
      executionId: "exec_keep_1",
      organizationId: "org_1",
      logOsExecutionEvent: log,
    });
    expect(out.productCompletionBlocked).toBe(false);
    expect(out.metadataStamps).toMatchObject({
      cdfCanonicalSaveFailed: true,
      cdfCanonicalSaveNote: CANONICAL_SAVE_FAILED_NOTE,
    });
    expect(events).toContain("execution.cdf_canonical_completion.save_failed_kept");
  });

  it("blocked save with no image (text) keeps the existing behaviour", async () => {
    const out = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: { ...canonicalImageMeta },
      structuredCandidate: null,
      mediaArtifactIds: [],
      executionId: "exec_keep_2",
      organizationId: "org_1",
      logOsExecutionEvent: log,
    });
    expect(out.productCompletionBlocked).toBe(true);
  });
});
