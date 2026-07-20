/**
 * Production validation enumerations.
 */

export type ScenarioDomain =
  | "marketing"
  | "software_development"
  | "research"
  | "image_generation"
  | "video_generation"
  | "audio_generation"
  | "translation"
  | "customer_support"
  | "sales"
  | "legal"
  | "healthcare"
  | "education"
  | "retail"
  | "hospitality"
  | "manufacturing"
  | "finance"
  | "hr";

export type ProductionExecutionMode = "live" | "openai_simulated";

export type ValidationCheckStatus = "pass" | "fail" | "warn" | "skip";

export type CertificationArea =
  | "execution"
  | "provider"
  | "capability"
  | "workflow"
  | "production_readiness";

export type FailureSeverity = "critical" | "major" | "minor" | "advisory";
