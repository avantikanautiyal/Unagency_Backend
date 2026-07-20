/** Provider Certification constants. */

export const CERTIFICATION_VERSION = "1.0.0";

export const PASSING_SCORE_THRESHOLD = 70;

export const CERTIFICATION_AREAS = [
  "request_validation",
  "response_validation",
  "streaming",
  "tool_calling",
  "function_calling",
  "structured_json_output",
  "token_accounting",
  "context_window_validation",
  "error_normalization",
  "retry_behaviour",
  "timeout_behaviour",
  "circuit_breaker_compatibility",
  "cancellation",
  "observability",
  "logging",
  "metrics",
  "health_reporting",
  "authentication_contract",
  "region_handling",
  "cost_reporting",
  "capability_manifest",
  "model_discovery",
  "model_metadata",
  "diagnostics",
  "performance",
] as const;

export const BENCHMARK_SCENARIOS = [
  "creative_writing",
  "code_generation",
  "reasoning",
  "research",
  "translation",
  "vision",
  "image_generation",
  "audio",
  "video",
  "long_context",
  "json_extraction",
  "tool_calling",
  "agent_collaboration",
] as const;
