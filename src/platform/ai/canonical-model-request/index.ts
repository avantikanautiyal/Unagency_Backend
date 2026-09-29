/**
 * Phase 4 — provider-neutral CanonicalModelRequest.
 */

export type {
  CanonicalMessageRole,
  CanonicalTextPart,
  CanonicalStructuredPart,
  CanonicalContentPart,
  CanonicalMessage,
  CanonicalOutputContract,
  CanonicalModelContext,
  CanonicalRequestMetadata,
  CanonicalModelRequest,
  CanonicalMultimodalProviderDeliveryBag,
} from "./types";

export {
  CANONICAL_MODEL_REQUEST_META_KEY,
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  isCanonicalModelRequest,
  countCanonicalContentParts,
} from "./types";

export {
  flattenCanonicalModelRequestToLabeledPrompt,
  stableSerializeCanonicalData,
} from "./flatten-labeled";

export {
  mapCanonicalModelRequestToProviderPayload,
  resolveCanonicalModelRequestFromCarrier,
  type CanonicalProviderPayloadProjection,
} from "./map-to-provider-payload";

export {
  extractCanonicalMultimodalProviderHandoff,
  canonicalImageDeliveriesToOpenAIContentParts,
  canonicalImageDeliveriesToAnthropicBlocks,
  CANONICAL_MULTIMODAL_MAPPING_SOURCE,
  type CanonicalMultimodalImageDelivery,
  type CanonicalMultimodalProviderHandoff,
} from "./extract-canonical-multimodal-delivery";
