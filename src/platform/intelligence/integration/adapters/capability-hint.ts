/**
 * Authoritative capability override when the client/API supplies a runtime capabilityId.
 * Prevents Task Intelligence catalogue remapping (e.g. marketing.social.carousel)
 * from overriding an explicit embedding.generate (or other inventory) request.
 */

import { asCapabilityId } from "../../shared/identifiers";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";

const RUNTIME_INVENTORY_CAPABILITIES = new Set([
  "text.generate",
  "text.chat",
  "reasoning.analyze",
  "image.generate",
  "vision.analyze",
  "video.generate",
  "audio.synthesize",
  "audio.transcribe",
  "embedding.generate",
]);

export function resolveExplicitCapabilityHint(
  request: IntelligenceOsIntegrationRequest
): string | undefined {
  const meta = request.metadata ?? {};
  const candidates = [
    typeof meta.briefPrimaryCapability === "string"
      ? meta.briefPrimaryCapability
      : undefined,
    typeof meta.capabilityHint === "string" ? meta.capabilityHint : undefined,
    typeof meta.capabilityId === "string" ? meta.capabilityId : undefined,
  ];
  for (const c of candidates) {
    const id = c?.trim();
    if (id && RUNTIME_INVENTORY_CAPABILITIES.has(id)) return id;
  }
  return undefined;
}

export function applyExplicitCapabilityHint(
  task: TaskIntelligenceReport,
  request: IntelligenceOsIntegrationRequest
): TaskIntelligenceReport {
  const hint = resolveExplicitCapabilityHint(request);
  if (!hint) return task;

  const capabilityId = asCapabilityId(hint);
  const fromBrief =
    typeof request.metadata?.briefId === "string" && request.metadata.briefId
      ? `StructuredBrief ${request.metadata.briefId}`
      : "API/client";
  const primaryReq = {
    capabilityId,
    label: hint,
    priority: 1,
    confidence: 1,
    rationale: `Authoritative capabilityHint from ${fromBrief}: ${hint}`,
  };

  const supportingFromBrief = Array.isArray(request.metadata?.briefRequiredCapabilities)
    ? (request.metadata!.briefRequiredCapabilities as unknown[])
        .map((x) => String(x))
        .filter((id) => id !== hint && RUNTIME_INVENTORY_CAPABILITIES.has(id))
        .map((id, i) => ({
          capabilityId: asCapabilityId(id),
          label: id,
          priority: i + 2,
          confidence: 0.9,
          rationale: `Supporting capability from StructuredBrief`,
        }))
    : [];

  return {
    ...task,
    capabilityMap: {
      primary: capabilityId,
      requirements: [
        primaryReq,
        ...supportingFromBrief,
        ...task.capabilityMap.requirements.filter(
          (r) =>
            String(r.capabilityId) !== hint &&
            !supportingFromBrief.some(
              (s) => String(s.capabilityId) === String(r.capabilityId)
            )
        ),
      ],
      confidence: 1,
      rationale: primaryReq.rationale,
    },
    structuredTask: {
      ...task.structuredTask,
      capabilityId,
      title:
        typeof request.metadata?.briefIntent === "string"
          ? `Brief:${request.metadata.briefIntent}`
          : `Capability ${hint}`,
      description:
        typeof request.metadata?.briefIntent === "string"
          ? `Structured brief intent=${request.metadata.briefIntent}; capability=${hint}`
          : `Explicit runtime capability: ${hint}`,
    },
  };
}
