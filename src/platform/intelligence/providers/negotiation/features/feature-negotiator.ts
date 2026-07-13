/**
 * Feature negotiator.
 *
 * Purpose: Negotiate requested features against model/provider capabilities.
 * Responsibilities: Produce negotiated vs rejected feature sets.
 * Usage: Feature stage of the negotiation pipeline.
 * Future Extension: Feature-level fallbacks (e.g. degrade streaming to batch).
 */

import { success, type Result } from "../../../shared/result";
import type {
  FeatureCompatibility,
  ModelCompatibility,
} from "../contracts/compatibility";
import type { NegotiableFeature } from "../contracts/enums";
import type { NegotiationContext } from "../interfaces/context";
import type { IFeatureNegotiator } from "../interfaces/negotiators";

/** Maps free-form plan feature strings to negotiable features. */
const FEATURE_ALIASES: Readonly<Record<string, NegotiableFeature>> = {
  streaming: "streaming",
  stream: "streaming",
  functions: "functions",
  function_calling: "functions",
  functioncalling: "functions",
  vision: "vision",
  images: "images",
  image: "images",
  audio: "audio",
  reasoning: "reasoning",
  tools: "tools",
  tool_use: "tools",
  embeddings: "embeddings",
  embedding: "embeddings",
  json_mode: "json_mode",
  json: "json_mode",
  response_format: "response_format",
  structured_output: "response_format",
  safety: "safety",
};

function normalizeFeature(name: string): NegotiableFeature | undefined {
  return FEATURE_ALIASES[name.trim().toLowerCase()];
}

function isSupported(
  feature: NegotiableFeature,
  model: ModelCompatibility
): boolean {
  switch (feature) {
    case "streaming":
      return model.supportsStreaming;
    case "functions":
      return model.supportsFunctionCalling;
    case "vision":
    case "images":
      return model.supportsVision;
    case "audio":
      return model.supportsAudio;
    case "reasoning":
      return model.supportsReasoning;
    case "tools":
      return model.supportsToolUse;
    case "embeddings":
      return model.supportsEmbeddings;
    case "json_mode":
      return model.supportsJsonMode;
    case "response_format":
      return model.supportsStructuredOutput;
    case "safety":
      // Safety features are assumed available (placeholder).
      return true;
    default:
      return false;
  }
}

export class FeatureNegotiator implements IFeatureNegotiator {
  negotiate(
    context: NegotiationContext,
    model: ModelCompatibility
  ): Result<FeatureCompatibility> {
    const reasons: string[] = [];
    const requested = new Set<NegotiableFeature>();

    for (const f of context.request.requestedFeatures ?? []) {
      requested.add(f);
    }
    for (const raw of context.request.plan.routingConstraints.requiredFeatures) {
      const normalized = normalizeFeature(raw);
      if (normalized) {
        requested.add(normalized);
      } else {
        reasons.push(`unrecognized required feature '${raw}' ignored`);
      }
    }

    const negotiated: NegotiableFeature[] = [];
    const rejected: NegotiableFeature[] = [];
    for (const feature of requested) {
      if (isSupported(feature, model)) {
        negotiated.push(feature);
      } else {
        rejected.push(feature);
        reasons.push(`feature '${feature}' not supported by the selected model`);
      }
    }

    return success({
      requested: [...requested],
      negotiated,
      rejected,
      reasons,
    });
  }
}
