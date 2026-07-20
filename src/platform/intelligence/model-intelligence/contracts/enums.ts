/**
 * Model Intelligence enumerations.
 */

export type BenchmarkCategory =
  | "reasoning"
  | "coding"
  | "creative_writing"
  | "marketing"
  | "brand_copy"
  | "seo"
  | "research"
  | "math"
  | "vision"
  | "ocr"
  | "image_understanding"
  | "image_generation"
  | "video_understanding"
  | "video_generation"
  | "translation"
  | "summarization"
  | "planning"
  | "tool_calling"
  | "function_calling"
  | "structured_output"
  | "conversation"
  | "long_context"
  | "agent_tasks"
  | "multimodal_tasks"
  | "audio"
  | "speech";

export type DepartmentKind =
  | "marketing"
  | "sales"
  | "branding"
  | "legal"
  | "finance"
  | "hr"
  | "healthcare"
  | "education"
  | "software_engineering"
  | "devops"
  | "cyber_security"
  | "ui_ux"
  | "graphic_design"
  | "animation"
  | "video_editing"
  | "architecture"
  | "research"
  | "customer_support"
  | "content_creation"
  | "social_media"
  | "business_intelligence"
  | "general";

export type ScoreDimension =
  | "reasoning"
  | "creativity"
  | "coding"
  | "planning"
  | "vision"
  | "research"
  | "writing"
  | "latency"
  | "reliability"
  | "cost"
  | "context"
  | "structured_output"
  | "tool_use"
  | "json"
  | "multilingual"
  | "image"
  | "video"
  | "speech"
  | "overall";

export type LeaderboardScope =
  | "global"
  | "provider"
  | "department"
  | "capability"
  | "cost_tier"
  | "region"
  | "latency_tier"
  | "enterprise_tier";

export type CostTier = "economy" | "standard" | "premium" | "enterprise";
export type PerformanceTier = "economy" | "balanced" | "performance" | "frontier";
export type ConfidenceLevel = "low" | "medium" | "high" | "very_high";

export type ScoreSourceKind =
  | "static_benchmark"
  | "production_telemetry"
  | "evaluation_report"
  | "learning_signal"
  | "execution_optimization"
  | "historical_success"
  | "customer_feedback";
