/**
 * Presentation artifact data schemas (M3B).
 * These are Artifact.data payloads — not the M3A envelope.
 */

import type { DeckBounds, DeckDimensions } from "./coordinates";
import type { PresentationArtifactKey } from "./keys";

/** Shared provenance refs inside creative data (IDs only). */
export type PresentationSourceRefs = {
  sourceInputIds?: string[];
  requirementIds?: string[];
  activeBriefId?: string;
  activeBriefVersion?: number;
  contextId?: string;
  contextHash?: string;
  /** Provenance only — never asset/artifact identity. */
  executionId?: string;
  upstreamArtifactRefs?: Array<{
    artifactId: string;
    version: number;
    artifactKey: string;
  }>;
  /** Vault ObjectIds (24-hex) — never cdfart_* or exec_*. */
  vaultAssetIds?: string[];
};

export type DesignTokenRef =
  | { kind: "token"; value: string }
  | { kind: "literal"; value: string };

// ─── presentation.source ───────────────────────────────────────────────────

export type PresentationSourceAssetRef = {
  vaultAssetId: string;
  role?: string;
  label?: string;
};

export type PresentationSourceDoc = {
  id: string;
  title?: string;
  kind?: "document" | "link" | "text" | "upload" | "other";
  uri?: string;
  summary?: string;
};

export type PresentationSourceData = {
  schemaId: string;
  title?: string;
  /** Pointers into Requirement Engine — not a duplicate ActiveBrief. */
  briefRef?: {
    activeBriefId?: string;
    activeBriefVersion?: number;
  };
  constraints?: string[];
  sourceDocuments?: PresentationSourceDoc[];
  sourceTextExcerpts?: Array<{ id: string; text: string; label?: string }>;
  referenceLinks?: Array<{ id: string; url: string; label?: string }>;
  uploadedAssets?: PresentationSourceAssetRef[];
  metadata?: Record<string, unknown>;
  sourceRefs?: PresentationSourceRefs;
};

// ─── presentation.storyline ────────────────────────────────────────────────

export type StorylineSection = {
  id: string;
  title: string;
  purpose?: string;
  order: number;
  slideIds: string[];
};

export type StorylineSlideIntention = {
  id: string;
  order: number;
  title: string;
  purpose?: string;
  keyMessage?: string;
  sectionId?: string;
  transitionNote?: string;
};

export type PresentationStorylineData = {
  schemaId: string;
  objective?: string;
  audience?: string;
  narrativeStrategy?: string;
  sections: StorylineSection[];
  slides: StorylineSlideIntention[];
  /** Optional narrative options produced by generation (preserved for continuity). */
  options?: ReadonlyArray<{
    id?: string;
    title?: string;
    summary?: string;
  }>;
  notes?: string;
  sourceRefs?: PresentationSourceRefs;
};

// ─── presentation.slide-content ────────────────────────────────────────────

export type SlideContentBlockType =
  | "heading"
  | "paragraph"
  | "bullets"
  | "table"
  | "metric"
  | "quote"
  | "callout"
  | "image_prompt"
  | "other";

export type SlideContentBlock = {
  id: string;
  type: SlideContentBlockType;
  /** Human/content payload — not layout coordinates. */
  content: unknown;
  hierarchy?: number;
  sourceRefs?: PresentationSourceRefs;
};

export type SlideContentSlide = {
  id: string;
  order: number;
  title: string;
  subtitle?: string;
  blocks: SlideContentBlock[];
  notes?: string;
  sourceRefs?: PresentationSourceRefs;
};

export type PresentationSlideContentData = {
  schemaId: string;
  slides: SlideContentSlide[];
  sourceRefs?: PresentationSourceRefs;
};

// ─── presentation.design-route ─────────────────────────────────────────────

export type PresentationDesignRouteData = {
  schemaId: string;
  routeId: string;
  name: string;
  description?: string;
  visualRationale?: string;
  visualIntent?: string;
  typographyDirection?: string;
  colorDirection?: string;
  imageryDirection?: string;
  layoutDirection?: string;
  componentDirection?: string;
  constraints?: string[];
  /** Representative preview assets (Vault ObjectIds). */
  representativeAssetIds?: string[];
  /** Optional slide IDs this route was sketched against. */
  sampleSlideIds?: string[];
  sourceRefs?: PresentationSourceRefs;
};

// ─── presentation.design-system ────────────────────────────────────────────

export type FontRole = {
  family: string;
  size?: number;
  weight?: number | string;
  lineHeight?: number;
  letterSpacing?: number;
};

export type PresentationDesignSystemData = {
  schemaId: string;
  name?: string;
  /** Exact design-route version this system was derived from. */
  derivedFromRoute?: {
    artifactId: string;
    version: number;
  };
  colors: Record<string, string>;
  fontRoles: Record<string, FontRole>;
  spacing?: Record<string, number>;
  grid?: {
    columns?: number;
    gutter?: number;
    margin?: number;
  };
  layoutRules?: string[];
  componentStyles?: Record<string, Record<string, unknown>>;
  shapeStyles?: Record<string, Record<string, unknown>>;
  imageTreatment?: Record<string, unknown>;
  iconTreatment?: Record<string, unknown>;
  chartTreatment?: Record<string, unknown>;
  tableTreatment?: Record<string, unknown>;
  backgroundStyles?: Record<string, unknown>;
  visualHierarchy?: string[];
  accessibility?: {
    minContrast?: string;
    maxLineLength?: number;
    notes?: string[];
  };
  sourceRefs?: PresentationSourceRefs;
};

// ─── presentation.deck (DeckSpec) ──────────────────────────────────────────

export type DeckElementType =
  | "text"
  | "image"
  | "shape"
  | "group"
  | "table"
  | "chart"
  | "graphic";

export type DeckStyleProps = {
  fill?: DesignTokenRef | string;
  stroke?: DesignTokenRef | string;
  strokeWidth?: number;
  opacity?: number;
  fontRole?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: DesignTokenRef | string;
  textAlign?: "left" | "center" | "right" | "justify";
  cornerRadius?: number;
  [key: string]: unknown;
};

type DeckElementBase = {
  id: string;
  type: DeckElementType;
  bounds: DeckBounds;
  zIndex: number;
  visible?: boolean;
  style?: DeckStyleProps;
  sourceRefs?: PresentationSourceRefs;
};

export type DeckTextElement = DeckElementBase & {
  type: "text";
  content: string;
};

export type DeckImageElement = DeckElementBase & {
  type: "image";
  /** Vault ObjectId — never execution or artifact id. */
  vaultAssetId: string;
  alt?: string;
};

export type DeckShapeElement = DeckElementBase & {
  type: "shape";
  shape: "rect" | "ellipse" | "line" | "path" | "other";
  pathData?: string;
};

export type DeckGroupElement = DeckElementBase & {
  type: "group";
  childIds: string[];
};

export type DeckTableElement = DeckElementBase & {
  type: "table";
  rows: string[][];
};

export type DeckChartElement = DeckElementBase & {
  type: "chart";
  chartType: string;
  data: Record<string, unknown>;
};

export type DeckGraphicElement = DeckElementBase & {
  type: "graphic";
  graphicKind?: string;
  payload?: Record<string, unknown>;
};

export type DeckElement =
  | DeckTextElement
  | DeckImageElement
  | DeckShapeElement
  | DeckGroupElement
  | DeckTableElement
  | DeckChartElement
  | DeckGraphicElement;

export type DeckSlide = {
  id: string;
  order: number;
  layoutRef?: string;
  background?: DesignTokenRef | string;
  elements: DeckElement[];
  notes?: string;
  sourceRefs?: PresentationSourceRefs;
};

export type DeckSpec = {
  schemaId: string;
  metadata: {
    title: string;
    subtitle?: string;
    locale?: string;
    dimensions: DeckDimensions;
  };
  /** Exact design-system artifact version. */
  designSystemRef: {
    artifactId: string;
    version: number;
    artifactKey: "presentation.design-system";
  };
  slides: DeckSlide[];
  sourceRefs?: PresentationSourceRefs;
};

export type PresentationDeckData = DeckSpec;

export type PresentationArtifactDataByKey = {
  "presentation.source": PresentationSourceData;
  "presentation.storyline": PresentationStorylineData;
  "presentation.slide-content": PresentationSlideContentData;
  "presentation.design-route": PresentationDesignRouteData;
  "presentation.design-system": PresentationDesignSystemData;
  "presentation.deck": PresentationDeckData;
};

export type AnyPresentationArtifactData =
  PresentationArtifactDataByKey[PresentationArtifactKey];
