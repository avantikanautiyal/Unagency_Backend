/** Provider Certification enumerations. */

export type CertificationStatus =
  | "certified"
  | "certified_with_warnings"
  | "rejected"
  | "experimental"
  | "deprecated";

export type CertificationArea =
  | "request_validation"
  | "response_validation"
  | "streaming"
  | "tool_calling"
  | "function_calling"
  | "structured_json_output"
  | "token_accounting"
  | "context_window_validation"
  | "error_normalization"
  | "retry_behaviour"
  | "timeout_behaviour"
  | "circuit_breaker_compatibility"
  | "cancellation"
  | "observability"
  | "logging"
  | "metrics"
  | "health_reporting"
  | "authentication_contract"
  | "region_handling"
  | "cost_reporting"
  | "capability_manifest"
  | "model_discovery"
  | "model_metadata"
  | "diagnostics"
  | "performance";

export type BenchmarkScenarioKind =
  | "creative_writing"
  | "code_generation"
  | "reasoning"
  | "research"
  | "translation"
  | "vision"
  | "image_generation"
  | "audio"
  | "video"
  | "long_context"
  | "json_extraction"
  | "tool_calling"
  | "agent_collaboration";

export type CertificationMode = "full" | "quick" | "regression";

export type ScoreDimension =
  | "compatibility"
  | "performance"
  | "reliability"
  | "streaming"
  | "tool_calling"
  | "json"
  | "observability"
  | "security"
  | "overall";

export type SuiteOutcome = "pass" | "warn" | "fail" | "skip";
