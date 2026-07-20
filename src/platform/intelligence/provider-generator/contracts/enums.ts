/** Provider Generator enumerations. */

export type ProviderCategory =
  | "llm"
  | "vision"
  | "image"
  | "video"
  | "audio"
  | "speech"
  | "music"
  | "ocr"
  | "embeddings"
  | "search"
  | "code"
  | "multimodal";

export type AuthenticationType =
  | "api_key"
  | "bearer"
  | "oauth2"
  | "mutual_tls"
  | "custom_header";

export type GeneratorArtifactKind =
  | "contracts"
  | "authentication"
  | "sdk"
  | "adapter"
  | "request_mapper"
  | "response_mapper"
  | "model_resolver"
  | "capability_mapper"
  | "discovery"
  | "dispatcher"
  | "health"
  | "factory"
  | "index"
  | "readme"
  | "constants"
  | "streaming"
  | "tool_calling"
  | "structured_output"
  | "observability"
  | "certification"
  | "unit_test"
  | "diagnostics";

export type GenerationMode = "dry_run" | "materialize";
