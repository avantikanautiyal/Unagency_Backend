/**
 * Workspace / project / studio hierarchy contracts.
 */

import type { StudioTypeId } from "./enums";

export interface StudioPinnedItem {
  readonly pinId: string;
  readonly targetKind: "workspace" | "project" | "campaign" | "document" | "asset" | "view";
  readonly targetId: string;
  readonly label: string;
  readonly pinnedAt: string;
}

export interface StudioFavorite {
  readonly favoriteId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly label: string;
  readonly createdAt: string;
}

export interface StudioTab {
  readonly tabId: string;
  readonly title: string;
  readonly viewId: string;
  readonly closable: boolean;
  readonly dirty: boolean;
}

export interface StudioView {
  readonly viewId: string;
  readonly name: string;
  readonly layoutId: string;
  readonly canvasId?: string;
  readonly widgetIds: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StudioLayoutRegion {
  readonly regionId: string;
  readonly edge: "left" | "right" | "top" | "bottom" | "center";
  readonly panelIds: readonly string[];
  readonly ratio: number;
}

export interface StudioLayout {
  readonly layoutId: string;
  readonly name: string;
  readonly regions: readonly StudioLayoutRegion[];
  readonly splitOrientation?: "horizontal" | "vertical";
}

export interface StudioDefinition {
  readonly studioId: string;
  readonly type: StudioTypeId;
  readonly name: string;
  readonly defaultLayoutId: string;
  readonly defaultPanelIds: readonly string[];
  readonly capabilities: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StudioProject {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly campaignIds: readonly string[];
  readonly studioIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioCampaignRef {
  readonly campaignId: string;
  readonly name: string;
  readonly status: string;
}

export interface StudioWorkspace {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string;
  readonly projectIds: readonly string[];
  readonly studioIds: readonly string[];
  readonly activeStudioId?: string;
  readonly openTabIds: readonly string[];
  readonly activeTabId?: string;
  readonly pinned: readonly StudioPinnedItem[];
  readonly favorites: readonly StudioFavorite[];
  readonly layoutId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
