/**
 * Streaming certification validator.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";
import { makeCertificationRequest } from "../fixtures/certification-fixtures";

export function validateStreaming(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  if (!harness.manifest.streaming.supported) {
    return [
      {
        code: "streaming_not_declared",
        message: "manifest does not declare streaming support",
        area: "streaming",
        severity: "info",
      },
    ];
  }
  const request = makeCertificationRequest({
    providerId: harness.manifest.providerId,
    streaming: true,
    features: ["streaming"],
  });
  const result = harness.adapter.translateRequest(request);
  if (!result.ok) {
    issues.push({
      code: "streaming_translate_failed",
      message: "streaming translateRequest failed",
      area: "streaming",
      severity: "error",
    });
  }
  if (harness.manifest.streaming.chunkModes.length === 0) {
    issues.push({
      code: "no_chunk_modes",
      message: "streaming profile missing chunk modes",
      area: "streaming",
      severity: "warning",
    });
  }
  return issues;
}
