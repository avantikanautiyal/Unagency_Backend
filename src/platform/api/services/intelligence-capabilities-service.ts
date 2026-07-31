/**
 * Server-authoritative executable capability truth (M10.5).
 * Distinct from GET /v1/capabilities catalogue marketing data.
 */

import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";

export type IntelligenceExecutionModeHint = "sync" | "async" | "streaming";

export interface IntelligenceCapabilityResource {
  readonly capabilityId: string;
  readonly available: boolean;
  readonly executionMode: IntelligenceExecutionModeHint;
  readonly supportsAsync: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsTools: boolean;
  readonly supportsStructuredOutput: boolean;
}

/**
 * Canonical inventory capability IDs (Capability Intelligence / runtime).
 * Do not invent IDs outside this set.
 */
const INVENTORY: readonly Omit<IntelligenceCapabilityResource, "available">[] = [
  {
    capabilityId: "text.generate",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    capabilityId: "text.chat",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    capabilityId: "reasoning.analyze",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    capabilityId: "image.generate",
    executionMode: "async",
    supportsAsync: true,
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
  },
  {
    capabilityId: "vision.analyze",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: true,
  },
  {
    capabilityId: "video.generate",
    executionMode: "async",
    supportsAsync: true,
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
  },
  {
    capabilityId: "audio.synthesize",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
  },
  {
    capabilityId: "audio.transcribe",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
  },
  {
    capabilityId: "embedding.generate",
    executionMode: "sync",
    supportsAsync: false,
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
  },
];

/**
 * Executable availability from runtime mode — never from catalogue alone.
 * - stub: API accepts create but no ControllableDispatcher leaf → not product-available
 * - simulated: ControllableDispatcher leaf available (credential-free)
 * - live: treated as available at this surface; provider config gates deeper
 */
export function listIntelligenceCapabilities(
  executionMode: EnterpriseApiExecutionMode
): readonly IntelligenceCapabilityResource[] {
  const productAvailable = executionMode === "simulated" || executionMode === "live";
  return INVENTORY.map((row) => ({
    ...row,
    available: productAvailable,
  }));
}

export const INTELLIGENCE_INVENTORY_CAPABILITY_IDS = INVENTORY.map(
  (r) => r.capabilityId
);
