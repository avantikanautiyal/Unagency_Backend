/**
 * Task Intelligence enumerations.
 */

export type IntentKind =
  | "primary"
  | "secondary"
  | "business"
  | "creative"
  | "technical"
  | "analytical"
  | "strategic"
  | "operational";

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

export type DomainKind =
  | "retail"
  | "real_estate"
  | "software"
  | "healthcare"
  | "finance"
  | "education"
  | "media"
  | "professional_services"
  | "general";

export type TaskCategoryKind =
  | "campaign_launch"
  | "product_launch"
  | "content_creation"
  | "research"
  | "design"
  | "development"
  | "support"
  | "compliance"
  | "operations"
  | "general";

export type TaskTypeKind =
  | "strategic"
  | "creative"
  | "analytical"
  | "technical"
  | "operational"
  | "review"
  | "approval";

export type ComplexityTier = "simple" | "moderate" | "complex" | "enterprise";

export type TaskNodeKind = "task" | "review_gate" | "approval_gate" | "validation_gate";

export type DependencyKind = "sequential" | "parallel" | "optional" | "blocking";

export type GateKind = "human_review" | "approval" | "validation";

export type PriorityLevel = "low" | "normal" | "high" | "critical";

export type QualityLevel = "draft" | "standard" | "high" | "premium";

export type PrivacyLevel = "public" | "internal" | "confidential" | "restricted";

export type PlaybookIndustry =
  | "retail"
  | "real_estate"
  | "software"
  | "healthcare"
  | "finance"
  | "general";
