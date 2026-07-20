/**
 * Execution Governance enumerations.
 */

export type GovernanceDecisionKind =
  | "approved"
  | "approved_with_conditions"
  | "pending_approval"
  | "blocked"
  | "rejected"
  | "escalated"
  | "deferred"
  | "cancelled";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type RiskCategory =
  | "business"
  | "brand"
  | "security"
  | "compliance"
  | "financial"
  | "execution"
  | "quality"
  | "privacy"
  | "operational";

export type ApprovalKind =
  | "automatic"
  | "manager"
  | "legal"
  | "brand"
  | "client"
  | "executive"
  | "human";

export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected" | "escalated";

export type PolicyKind =
  | "max_execution_cost"
  | "max_token_budget"
  | "max_latency"
  | "allowed_providers"
  | "allowed_model_families"
  | "allowed_regions"
  | "workspace_restrictions"
  | "department_restrictions"
  | "mandatory_approvals"
  | "business_hours"
  | "confidential_workflow"
  | "restricted_workflow";

export type ComplianceFramework = "gdpr" | "hipaa" | "soc2" | "iso27001" | "internal" | "client_specific";

export type PrivacyClassification = "public" | "internal" | "confidential" | "restricted" | "pii";

export type QualityGateKind =
  | "minimum_quality_score"
  | "minimum_confidence"
  | "required_citations"
  | "required_review"
  | "required_evaluation"
  | "brand_compliance"
  | "output_completeness";
