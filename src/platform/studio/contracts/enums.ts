/**
 * Studio Engine enums — UI-framework agnostic.
 */

export type StudioTypeId =
  | "marketing"
  | "brand"
  | "website"
  | "landing_page"
  | "social_media"
  | "content"
  | "video"
  | "image"
  | "research"
  | "automation"
  | "analytics"
  | "knowledge"
  | "approval"
  | "admin";

export type StudioPanelKind =
  | "sidebar"
  | "toolbar"
  | "inspector"
  | "properties"
  | "bottom"
  | "dock"
  | "canvas"
  | "split";

export type StudioDockEdge = "left" | "right" | "top" | "bottom" | "center";

export type StudioActivityKind =
  | "user_action"
  | "ai_action"
  | "review"
  | "approval"
  | "comment"
  | "version"
  | "artifact"
  | "execution"
  | "assignment"
  | "presence";

export type StudioDocumentKind =
  | "rich_document"
  | "campaign_brief"
  | "creative_brief"
  | "research_report"
  | "specification"
  | "generated_output"
  | "reference";

export type StudioWidgetKind =
  | "campaign_overview"
  | "execution_status"
  | "brand_summary"
  | "knowledge_explorer"
  | "analytics"
  | "approvals"
  | "tasks"
  | "timeline"
  | "assets"
  | "custom";

export type StudioPresenceStatus = "online" | "away" | "offline" | "editing";

export type StudioApprovalStatus =
  | "draft"
  | "requested"
  | "approved"
  | "rejected"
  | "changes_requested";

export type StudioIntegrationChannel = "enterprise_api_gateway";
