/**
 * Deterministic Presentation artifact fixtures (M3B) — no AI providers.
 */

import { DEFAULT_DECK_DIMENSIONS } from "./coordinates";
import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "./keys";
import type {
  PresentationDesignRouteData,
  PresentationDesignSystemData,
  PresentationDeckData,
  PresentationSlideContentData,
  PresentationSourceData,
  PresentationStorylineData,
} from "./types";

/** Stable fixture ids used across lineage examples. */
export const FIXTURE_IDS = {
  designSystemArtifactId: "cdfart_fixture_design_system_01",
  designRouteArtifactId: "cdfart_fixture_design_route_01",
  storylineArtifactId: "cdfart_fixture_storyline_01",
  slideContentArtifactId: "cdfart_fixture_slide_content_01",
  sourceArtifactId: "cdfart_fixture_source_01",
  vaultImage: "507f1f77bcf86cd799439011",
} as const;

export function fixturePresentationSource(): PresentationSourceData {
  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.source),
    title: "Series A investor deck — source pack",
    briefRef: {
      activeBriefId: "brief_fixture_1",
      activeBriefVersion: 1,
    },
    constraints: ["Do not invent revenue numbers", "12 slides target"],
    sourceDocuments: [
      {
        id: "doc_brief_notes",
        title: "Founder notes",
        kind: "text",
        summary: "Problem / solution outline",
      },
    ],
    sourceTextExcerpts: [
      {
        id: "excerpt_01",
        text: "Audience: Series A investors. Tone: premium and credible.",
      },
    ],
    referenceLinks: [
      {
        id: "link_01",
        url: "https://example.com/product",
        label: "Product site",
      },
    ],
    uploadedAssets: [
      {
        vaultAssetId: FIXTURE_IDS.vaultImage,
        role: "logo",
        label: "Brand mark",
      },
    ],
    sourceRefs: {
      sourceInputIds: ["src_fixture_1"],
      activeBriefId: "brief_fixture_1",
      activeBriefVersion: 1,
      contextId: "ctx_fixture_1",
      contextHash: "hash_fixture_1",
    },
  };
}

export function fixturePresentationStoryline(): PresentationStorylineData {
  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.storyline),
    objective: "Secure Series A interest",
    audience: "Series A investors",
    narrativeStrategy: "Problem → Insight → Solution → Proof → Ask",
    sections: [
      {
        id: "section_open",
        title: "Opening",
        purpose: "Frame the opportunity",
        order: 0,
        slideIds: ["slide_01"],
      },
      {
        id: "section_core",
        title: "Core narrative",
        purpose: "Explain product and market",
        order: 1,
        slideIds: ["slide_02", "slide_03"],
      },
    ],
    slides: [
      {
        id: "slide_01",
        order: 0,
        title: "Title",
        purpose: "Introduce the company",
        keyMessage: "Category-defining B2B SaaS",
        sectionId: "section_open",
      },
      {
        id: "slide_02",
        order: 1,
        title: "The Problem",
        purpose: "Name the pain",
        keyMessage: "Ops teams lose weeks to fragmented tooling",
        sectionId: "section_core",
      },
      {
        id: "slide_03",
        order: 2,
        title: "Our Solution",
        purpose: "Show the product wedge",
        keyMessage: "One workflow system for creative ops",
        sectionId: "section_core",
      },
    ],
    notes: "Fixture storyline — 3 slides",
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: FIXTURE_IDS.sourceArtifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.source,
        },
      ],
    },
  };
}

export function fixturePresentationSlideContent(): PresentationSlideContentData {
  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.slideContent),
    slides: [
      {
        id: "slide_01",
        order: 0,
        title: "Title",
        subtitle: "Investor presentation",
        blocks: [
          {
            id: "block_title_01",
            type: "heading",
            content: "Acme — Creative Ops Platform",
            hierarchy: 1,
          },
          {
            id: "block_sub_01",
            type: "paragraph",
            content: "Series A",
            hierarchy: 2,
          },
        ],
      },
      {
        id: "slide_02",
        order: 1,
        title: "The Problem",
        blocks: [
          {
            id: "block_bullets_02",
            type: "bullets",
            content: [
              "Fragmented tooling",
              "Slow approvals",
              "No single source of truth",
            ],
            hierarchy: 1,
          },
          {
            id: "block_metric_02",
            type: "metric",
            content: { label: "Weeks lost / quarter", value: "3–5" },
            hierarchy: 2,
          },
        ],
        notes: "Keep factual; no invented revenue",
      },
      {
        id: "slide_03",
        order: 2,
        title: "Our Solution",
        blocks: [
          {
            id: "block_callout_03",
            type: "callout",
            content: "One workflow for brief → produce → approve → ship",
            hierarchy: 1,
          },
          {
            id: "block_quote_03",
            type: "quote",
            content: "We finally know who owns each asset.",
            hierarchy: 2,
          },
        ],
      },
    ],
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: FIXTURE_IDS.storylineArtifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
        },
      ],
    },
  };
}

export function fixturePresentationDesignRoute(
  routeId = "route_bold_executive",
): PresentationDesignRouteData {
  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designRoute),
    routeId,
    name: "Bold Executive",
    description: "Dark backgrounds, large type, high-contrast imagery.",
    visualRationale: "Signals premium confidence for investor audiences.",
    visualIntent: "executive_dark",
    typographyDirection: "Large sans display + tight body",
    colorDirection: "Navy / white / green accent",
    imageryDirection: "Sparse product UI crops",
    layoutDirection: "Asymmetric left-weighted",
    componentDirection: "Metric cards + full-bleed title slides",
    constraints: ["High contrast", "Minimal decoration"],
    representativeAssetIds: [FIXTURE_IDS.vaultImage],
    sampleSlideIds: ["slide_01", "slide_02"],
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: FIXTURE_IDS.slideContentArtifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
        },
      ],
    },
  };
}

export function fixturePresentationDesignSystem(): PresentationDesignSystemData {
  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designSystem),
    name: "Bold Executive System",
    derivedFromRoute: {
      artifactId: FIXTURE_IDS.designRouteArtifactId,
      version: 1,
    },
    colors: {
      "color.primary": "#0B1F3A",
      "color.surface": "#0B1F3A",
      "color.on_surface": "#FFFFFF",
      "color.accent": "#2ECC71",
    },
    fontRoles: {
      title: { family: "Inter", size: 44, weight: 700 },
      subtitle: { family: "Inter", size: 22, weight: 500 },
      body: { family: "Inter", size: 16, weight: 400 },
      metric: { family: "Inter", size: 32, weight: 600 },
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
    grid: { columns: 12, gutter: 16, margin: 48 },
    layoutRules: ["Title slides use full-bleed navy", "Body slides keep 48px margin"],
    visualHierarchy: ["title", "metric", "body"],
    accessibility: {
      minContrast: "AA",
      notes: ["White on navy for body text"],
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: FIXTURE_IDS.designRouteArtifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
        },
      ],
    },
  };
}

export function fixturePresentationDeck(
  designSystemArtifactId: string = FIXTURE_IDS.designSystemArtifactId,
): PresentationDeckData {
  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.deck),
    metadata: {
      title: "Acme Series A",
      subtitle: "Investor presentation",
      locale: "en-US",
      dimensions: { ...DEFAULT_DECK_DIMENSIONS },
    },
    designSystemRef: {
      artifactId: designSystemArtifactId,
      version: 1,
      artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
    },
    slides: [
      {
        id: "slide_01",
        order: 0,
        layoutRef: "layout_title",
        background: { kind: "token", value: "color.primary" },
        elements: [
          {
            id: "element_title_01",
            type: "text",
            content: "Acme — Creative Ops Platform",
            bounds: { x: 0.08, y: 0.35, width: 0.84, height: 0.18 },
            zIndex: 2,
            style: {
              fontRole: "title",
              color: { kind: "token", value: "color.on_surface" },
              textAlign: "left",
            },
          },
          {
            id: "element_shape_01",
            type: "shape",
            shape: "rect",
            bounds: { x: 0.08, y: 0.55, width: 0.12, height: 0.01 },
            zIndex: 1,
            style: {
              fill: { kind: "token", value: "color.accent" },
            },
          },
        ],
      },
      {
        id: "slide_02",
        order: 1,
        layoutRef: "layout_bullets",
        elements: [
          {
            id: "element_title_02",
            type: "text",
            content: "The Problem",
            bounds: { x: 0.08, y: 0.1, width: 0.7, height: 0.12 },
            zIndex: 2,
            style: { fontRole: "title" },
          },
          {
            id: "element_body_02",
            type: "text",
            content:
              "• Fragmented tooling\n• Slow approvals\n• No single source of truth",
            bounds: { x: 0.08, y: 0.28, width: 0.55, height: 0.4 },
            zIndex: 2,
            style: { fontRole: "body" },
          },
          {
            id: "element_image_02",
            type: "image",
            vaultAssetId: FIXTURE_IDS.vaultImage,
            alt: "Product UI crop",
            bounds: { x: 0.66, y: 0.25, width: 0.26, height: 0.45 },
            zIndex: 1,
          },
        ],
        notes: "Keep factual",
      },
      {
        id: "slide_03",
        order: 2,
        layoutRef: "layout_split",
        elements: [
          {
            id: "element_title_03",
            type: "text",
            content: "Our Solution",
            bounds: { x: 0.08, y: 0.1, width: 0.8, height: 0.12 },
            zIndex: 2,
            style: { fontRole: "title" },
          },
          {
            id: "element_metric_03",
            type: "text",
            content: "One workflow: brief → produce → approve → ship",
            bounds: { x: 0.08, y: 0.32, width: 0.84, height: 0.2 },
            zIndex: 2,
            style: { fontRole: "metric" },
          },
          {
            id: "element_shape_03",
            type: "shape",
            shape: "ellipse",
            bounds: { x: 0.8, y: 0.7, width: 0.1, height: 0.12 },
            zIndex: 0,
            style: {
              fill: { kind: "token", value: "color.accent" },
              opacity: 0.35,
            },
          },
        ],
      },
    ],
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: FIXTURE_IDS.slideContentArtifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.slideContent,
        },
        {
          artifactId: designSystemArtifactId,
          version: 1,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
        },
      ],
      contextId: "ctx_fixture_1",
      contextHash: "hash_fixture_1",
      executionId: "exec_fixture_deck_1",
    },
  };
}
