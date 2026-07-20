/**
 * Documents, assets, widgets, extensions.
 */

import type { StudioDocumentKind, StudioWidgetKind } from "./enums";

export interface StudioDocument {
  readonly documentId: string;
  readonly workspaceId: string;
  readonly kind: StudioDocumentKind;
  readonly title: string;
  readonly bodyRef: string;
  readonly version: number;
  readonly referenceIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StudioAsset {
  readonly assetId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly uriRef: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
}

/** Widget = metadata only — frontends render. */
export interface StudioWidgetDescriptor {
  readonly widgetId: string;
  readonly kind: StudioWidgetKind;
  readonly title: string;
  readonly dataBinding: Readonly<Record<string, unknown>>;
  readonly sizeHint: { readonly w: number; readonly h: number };
  readonly refreshPolicy: "manual" | "on_focus" | "interval";
  readonly extensionId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StudioExtensionManifest {
  readonly extensionId: string;
  readonly name: string;
  readonly version: string;
  readonly contributesWidgets: readonly StudioWidgetKind[];
  readonly contributesPanels: readonly string[];
  readonly contributesShortcuts: readonly string[];
  readonly enabled: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StudioShortcut {
  readonly shortcutId: string;
  readonly binding: string;
  readonly actionId: string;
  readonly scope: "global" | "canvas" | "panel" | "session";
}
