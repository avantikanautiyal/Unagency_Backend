/**
 * Canonical Studio type configurations — same engine, different configs.
 */

import type { StudioDefinition, StudioLayout, StudioTypeId } from "../contracts";
import type { StudioWidgetDescriptor } from "../contracts";

export interface StudioTypeConfig {
  readonly type: StudioTypeId;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly defaultWidgets: readonly Omit<
    StudioWidgetDescriptor,
    "widgetId" | "metadata"
  >[];
  readonly panelTitles: {
    readonly sidebar: string;
    readonly inspector: string;
    readonly bottom: string;
  };
}

export const STUDIO_TYPE_CONFIGS: Readonly<Record<StudioTypeId, StudioTypeConfig>> = {
  marketing: {
    type: "marketing",
    name: "Marketing Studio",
    capabilities: ["marketing.copy", "campaign.plan"],
    defaultWidgets: [
      { kind: "campaign_overview", title: "Campaign Overview", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "on_focus" },
      { kind: "timeline", title: "Activity", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "approvals", title: "Approvals", dataBinding: {}, sizeHint: { w: 1, h: 1 }, refreshPolicy: "manual" },
    ],
    panelTitles: { sidebar: "Campaigns", inspector: "Brief", bottom: "Timeline" },
  },
  brand: {
    type: "brand",
    name: "Brand Studio",
    capabilities: ["brand.identity", "brand.tone"],
    defaultWidgets: [
      { kind: "brand_summary", title: "Brand Summary", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "manual" },
      { kind: "knowledge_explorer", title: "Knowledge", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "on_focus" },
    ],
    panelTitles: { sidebar: "Identity", inspector: "Tone", bottom: "History" },
  },
  website: {
    type: "website",
    name: "Website Studio",
    capabilities: ["web.page", "web.seo"],
    defaultWidgets: [
      { kind: "assets", title: "Assets", dataBinding: {}, sizeHint: { w: 1, h: 2 }, refreshPolicy: "manual" },
      { kind: "execution_status", title: "Builds", dataBinding: {}, sizeHint: { w: 1, h: 1 }, refreshPolicy: "interval" },
    ],
    panelTitles: { sidebar: "Pages", inspector: "SEO", bottom: "Preview Notes" },
  },
  landing_page: {
    type: "landing_page",
    name: "Landing Page Studio",
    capabilities: ["web.landing"],
    defaultWidgets: [
      { kind: "campaign_overview", title: "Offer", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "manual" },
      { kind: "analytics", title: "Conversion", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "interval" },
    ],
    panelTitles: { sidebar: "Sections", inspector: "CTA", bottom: "Experiments" },
  },
  social_media: {
    type: "social_media",
    name: "Social Media Studio",
    capabilities: ["social.post", "social.calendar"],
    defaultWidgets: [
      { kind: "timeline", title: "Calendar", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "assets", title: "Creatives", dataBinding: {}, sizeHint: { w: 1, h: 2 }, refreshPolicy: "manual" },
    ],
    panelTitles: { sidebar: "Channels", inspector: "Post", bottom: "Queue" },
  },
  content: {
    type: "content",
    name: "Content Studio",
    capabilities: ["content.draft", "content.edit"],
    defaultWidgets: [
      { kind: "tasks", title: "Editorial Tasks", dataBinding: {}, sizeHint: { w: 1, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "execution_status", title: "Generations", dataBinding: {}, sizeHint: { w: 1, h: 1 }, refreshPolicy: "interval" },
    ],
    panelTitles: { sidebar: "Library", inspector: "Style", bottom: "Versions" },
  },
  video: {
    type: "video",
    name: "Video Studio",
    capabilities: ["video.script", "video.storyboard"],
    defaultWidgets: [
      { kind: "assets", title: "Clips", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "manual" },
      { kind: "timeline", title: "Edit Timeline", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "on_focus" },
    ],
    panelTitles: { sidebar: "Media", inspector: "Shot", bottom: "Transcript" },
  },
  image: {
    type: "image",
    name: "Image Studio",
    capabilities: ["image.generate", "image.edit"],
    defaultWidgets: [
      { kind: "assets", title: "Gallery", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "manual" },
      { kind: "brand_summary", title: "Visual System", dataBinding: {}, sizeHint: { w: 1, h: 1 }, refreshPolicy: "manual" },
    ],
    panelTitles: { sidebar: "Boards", inspector: "Prompt Refs", bottom: "Variants" },
  },
  research: {
    type: "research",
    name: "Research Studio",
    capabilities: ["research.brief", "research.report"],
    defaultWidgets: [
      { kind: "knowledge_explorer", title: "Sources", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "tasks", title: "Questions", dataBinding: {}, sizeHint: { w: 1, h: 2 }, refreshPolicy: "manual" },
    ],
    panelTitles: { sidebar: "Topics", inspector: "Evidence", bottom: "Notes" },
  },
  automation: {
    type: "automation",
    name: "Automation Studio",
    capabilities: ["automation.workflow"],
    defaultWidgets: [
      { kind: "execution_status", title: "Runs", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "interval" },
      { kind: "tasks", title: "Jobs", dataBinding: {}, sizeHint: { w: 1, h: 2 }, refreshPolicy: "on_focus" },
    ],
    panelTitles: { sidebar: "Flows", inspector: "Node", bottom: "Logs" },
  },
  analytics: {
    type: "analytics",
    name: "Analytics Studio",
    capabilities: ["analytics.report"],
    defaultWidgets: [
      { kind: "analytics", title: "Performance", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "interval" },
      { kind: "campaign_overview", title: "Campaigns", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "on_focus" },
    ],
    panelTitles: { sidebar: "Metrics", inspector: "Filter", bottom: "Exports" },
  },
  knowledge: {
    type: "knowledge",
    name: "Knowledge Studio",
    capabilities: ["knowledge.explore"],
    defaultWidgets: [
      { kind: "knowledge_explorer", title: "Graph", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "brand_summary", title: "Brand Brain", dataBinding: {}, sizeHint: { w: 1, h: 1 }, refreshPolicy: "manual" },
    ],
    panelTitles: { sidebar: "Entities", inspector: "Relation", bottom: "Evidence" },
  },
  approval: {
    type: "approval",
    name: "Approval Studio",
    capabilities: ["approval.review"],
    defaultWidgets: [
      { kind: "approvals", title: "Queue", dataBinding: {}, sizeHint: { w: 2, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "timeline", title: "Decisions", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "manual" },
    ],
    panelTitles: { sidebar: "Inbox", inspector: "Diff", bottom: "Comments" },
  },
  admin: {
    type: "admin",
    name: "Admin Studio",
    capabilities: ["admin.org", "admin.users"],
    defaultWidgets: [
      { kind: "tasks", title: "Ops Tasks", dataBinding: {}, sizeHint: { w: 1, h: 2 }, refreshPolicy: "on_focus" },
      { kind: "analytics", title: "Usage", dataBinding: {}, sizeHint: { w: 2, h: 1 }, refreshPolicy: "interval" },
    ],
    panelTitles: { sidebar: "Org", inspector: "Policy", bottom: "Audit" },
  },
};

export function buildDefaultLayout(layoutId: string, name: string): StudioLayout {
  return {
    layoutId,
    name,
    regions: [
      { regionId: `${layoutId}_left`, edge: "left", panelIds: [], ratio: 0.2 },
      { regionId: `${layoutId}_center`, edge: "center", panelIds: [], ratio: 0.55 },
      { regionId: `${layoutId}_right`, edge: "right", panelIds: [], ratio: 0.25 },
      { regionId: `${layoutId}_bottom`, edge: "bottom", panelIds: [], ratio: 0.25 },
    ],
    splitOrientation: "horizontal",
  };
}

export function studioDefinitionFromType(
  studioId: string,
  type: StudioTypeId,
  layoutId: string,
  widgetIds: readonly string[]
): StudioDefinition {
  const cfg = STUDIO_TYPE_CONFIGS[type];
  return {
    studioId,
    type,
    name: cfg.name,
    defaultLayoutId: layoutId,
    defaultWidgetIds: widgetIds,
    capabilities: cfg.capabilities,
    metadata: {},
  };
}
