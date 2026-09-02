/**
 * Model Registry enumerations.
 */

export type ModalityKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "embedding"
  | "multimodal";

export type ModelLifecycleState =
  | "draft"
  | "preview"
  | "active"
  | "deprecated"
  | "retired";

export type LatencyTier = "ultra_low" | "low" | "medium" | "high";

export type QualityTier = "economy" | "standard" | "premium" | "frontier";

export type AvailabilityState = "available" | "limited" | "preview" | "unavailable";

export type InputTypeKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "structured";

export type OutputTypeKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "embedding"
  | "structured"
  | "json";

export type PricingUnit = "per_1k_input_tokens" | "per_1k_output_tokens" | "per_request" | "per_image" | "per_minute";

export type DepartmentKind =
  | "general"
  | "creative"
  | "research"
  | "coding"
  | "enterprise"
  | "media";
