/**
 * Reopening a chat re-ran the canonical save for finished steps. The save hit
 * the step's own earlier save (same idempotency key) and the step was turned
 * into a failure ("VALIDATION_ERROR" / "ingest_error") although its image
 * existed. 25 of 25 such failures in Nov 2-6 data had this cause.
 */

import { isIdempotencyConflictOnlyBlock } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import { CdfGenerationArtifactError } from "../../../src/platform/cdf/generation-artifact/errors";

const base = {
  productCompletionBlocked: true,
  presentationIngestFailure: null,
  packagingIngestFailure: null,
  socialMediaIngestFailure: null,
  genericIngestFailure: null,
};

describe("idempotency conflict on re-ingest", () => {
  it("generic family: the real code is reported, not VALIDATION_ERROR", () => {
    const err = new CdfGenerationArtifactError(
      "GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT",
      "Idempotency key m3c:exec_1:logo already bound to a different payload",
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.generationArtifactCode).toBe("GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT");
    expect(
      isIdempotencyConflictOnlyBlock({
        ...base,
        productCompletionBlockReason: err.generationArtifactCode,
      }),
    ).toBe(true);
  });

  it("packaging: detected from the failure record message (reason is ingest_error)", () => {
    expect(
      isIdempotencyConflictOnlyBlock({
        ...base,
        productCompletionBlockReason: "ingest_error",
        packagingIngestFailure: {
          cdfFallbackReason: "ingest_error",
          message:
            "[GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT] Idempotency key m8b_ingest_exec_6697_complete-pack already bound to a different payload",
        },
      }),
    ).toBe(true);
  });

  it("real blocks still block", () => {
    expect(
      isIdempotencyConflictOnlyBlock({ ...base, productCompletionBlockReason: "canonical_artifact_missing" }),
    ).toBe(false);
    expect(
      isIdempotencyConflictOnlyBlock({ ...base, productCompletionBlocked: false }),
    ).toBe(false);
  });
});
