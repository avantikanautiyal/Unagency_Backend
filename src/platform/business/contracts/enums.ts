/**
 * Business Platform enumerations.
 */

export type BusinessRole =
  | "owner"
  | "admin"
  | "manager"
  | "contributor"
  | "reviewer"
  | "viewer"
  | "billing";

export type BusinessPermission =
  | "org:manage"
  | "workspace:manage"
  | "project:manage"
  | "brand:manage"
  | "campaign:manage"
  | "knowledge:manage"
  | "workflow:manage"
  | "execution:request"
  | "execution:read"
  | "approval:decide"
  | "billing:manage"
  | "marketplace:publish"
  | "analytics:read"
  | "audit:read"
  | "team:manage"
  | "settings:manage";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type CampaignChannel =
  | "social"
  | "email"
  | "web"
  | "ads"
  | "video"
  | "print"
  | "other";

export type KnowledgeDocKind =
  | "brand"
  | "product"
  | "faq"
  | "policy"
  | "general";

export type BusinessExecutionStatus =
  | "draft"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "awaiting_approval";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "paused";

export type PlanTier = "free" | "starter" | "growth" | "enterprise";

export type MarketplaceAssetKind =
  | "workflow_template"
  | "prompt_template"
  | "campaign_template"
  | "brand_template"
  | "community";

export type ActivityKind =
  | "comment"
  | "mention"
  | "assignment"
  | "review_request"
  | "approval"
  | "execution"
  | "campaign_update"
  | "system";
