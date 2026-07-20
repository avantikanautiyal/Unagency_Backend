/**
 * Universal Provider Template enumerations.
 * Vendor-neutral — no provider-specific values.
 */

export type TemplateLifecyclePhase =
  | "uninitialized"
  | "initializing"
  | "authenticating"
  | "validating"
  | "health_checking"
  | "loading_models"
  | "ready"
  | "executing"
  | "streaming"
  | "shutting_down"
  | "shutdown";

export type TemplateHealthState =
  | "healthy"
  | "degraded"
  | "maintenance"
  | "offline"
  | "disabled"
  | "deprecated";

export type TemplateErrorKind =
  | "authentication"
  | "rate_limit"
  | "quota"
  | "timeout"
  | "network"
  | "validation"
  | "model"
  | "safety"
  | "streaming"
  | "tool"
  | "internal";

export type TemplateFeatureKind =
  | "text_generation"
  | "reasoning"
  | "vision"
  | "image_generation"
  | "video_generation"
  | "audio_input"
  | "audio_output"
  | "embeddings"
  | "moderation"
  | "streaming"
  | "tool_calling"
  | "function_calling"
  | "structured_output"
  | "json_mode"
  | "assistants"
  | "fine_tuning"
  | "realtime"
  | "batch";

export type TemplateModality =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "embedding"
  | "multimodal"
  | "structured";

export type TemplateStreamEventKind =
  | "start"
  | "chunk"
  | "heartbeat"
  | "end"
  | "error";
