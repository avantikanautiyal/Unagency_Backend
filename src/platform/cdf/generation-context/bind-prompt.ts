/**
 * LEGACY / COMPATIBILITY — CanonicalGenerationRequest → labeled flat prompt.
 *
 * Phase 4: application semantic SoT is CanonicalModelRequest.
 * Prefer:
 *   compileCanonicalModelRequestFromGeneration → mapCanonicalModelRequestToProviderPayload
 *
 * This binder remains for Phase 2 unit tests and any non-runtime callers that
 * still need a labeled string without going through DirectEngine.
 */

import {
  flattenCanonicalModelRequestToLabeledPrompt,
} from "../../ai/canonical-model-request";
import { compileCanonicalModelRequestFromGeneration } from "./compile-model-request";
import type { CanonicalGenerationRequest } from "./types";

/**
 * Serialize structured artifact data without the legacy 1500-char note truncation.
 * @deprecated Prefer structured CanonicalModelRequest upstream_artifact parts.
 */
export function formatUpstreamArtifactForPrompt(
  req: CanonicalGenerationRequest["upstreamArtifacts"][number],
): string {
  const header = [
    `Role: ${req.role}`,
    `Artifact: ${req.artifactKey}`,
    `ArtifactId: ${req.artifactId}`,
    `Version: ${req.version}`,
    `Phase: ${req.phaseId}`,
    `Status: ${req.status}`,
    `SessionRole: ${req.sessionRole}`,
    `SchemaVersion: ${req.schemaVersion}`,
    `Required: ${req.required}`,
  ].join("\n");
  return `${header}\nContent:\n${JSON.stringify(req.data, null, 2)}`;
}

/**
 * @deprecated Compatibility only. Flattening belongs in provider compatibility
 * (`flattenCanonicalModelRequestToLabeledPrompt` / `mapCanonicalModelRequestToProviderPayload`).
 */
export function bindCanonicalGenerationRequestToPrompt(
  request: CanonicalGenerationRequest,
): string {
  const modelRequest = compileCanonicalModelRequestFromGeneration(request);
  return flattenCanonicalModelRequestToLabeledPrompt(modelRequest);
}
