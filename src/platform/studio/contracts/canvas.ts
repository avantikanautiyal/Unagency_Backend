/**
 * Canvas / panel / block contracts — render descriptions, not UI code.
 */

import type { StudioDockEdge, StudioPanelKind } from "./enums";

export interface StudioBlock {
  readonly blockId: string;
  readonly kind: string;
  readonly title?: string;
  readonly order: number;
  readonly props: Readonly<Record<string, unknown>>;
  readonly childBlockIds: readonly string[];
}

export interface StudioSection {
  readonly sectionId: string;
  readonly title: string;
  readonly order: number;
  readonly blockIds: readonly string[];
  readonly collapsed: boolean;
}

export interface StudioPanel {
  readonly panelId: string;
  readonly kind: StudioPanelKind;
  readonly title: string;
  readonly dock: StudioDockEdge;
  readonly visible: boolean;
  readonly order: number;
  readonly widgetIds: readonly string[];
  readonly props: Readonly<Record<string, unknown>>;
}

export interface StudioCanvas {
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly sectionIds: readonly string[];
  readonly panelIds: readonly string[];
  readonly toolbarPanelId?: string;
  readonly sidebarPanelId?: string;
  readonly inspectorPanelId?: string;
  readonly bottomPanelId?: string;
  readonly splitViewEnabled: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}
