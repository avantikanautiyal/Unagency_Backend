/**
 * Canonical presentation structured schemas (mirrors packages/api structured-schemas).
 */

const PRESENTATION_SLIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "bullets", "notes", "layout", "visualCue"],
  properties: {
    title: { type: "string" },
    bullets: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
    },
    notes: { type: "string" },
    layout: {
      type: "string",
      enum: [
        "title_hero",
        "section_divider",
        "content_bullets",
        "key_message",
        "closing",
      ],
    },
    visualCue: { type: "string" },
  },
} as const;

/** Phase A — lightweight route concepts grounded in the brief. */
export const PRESENTATION_ROUTE_CONCEPTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "narrativeAngle"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          narrativeAngle: { type: "string" },
        },
      },
    },
  },
} as const;

/** Single deck expansion (lazy route preview / fast path). */
export const PRESENTATION_PLAN_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "slides"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    slides: {
      type: "array",
      minItems: 6,
      maxItems: 14,
      items: PRESENTATION_SLIDE_SCHEMA,
    },
  },
} as const;

/** Phase B — full designed decks (final deliverable shape). */
export const PRESENTATION_ROUTES_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["routes"],
  properties: {
    routes: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "deckTitle",
          "deckSubtitle",
          "slides",
        ],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          deckTitle: { type: "string" },
          deckSubtitle: { type: "string" },
          slides: {
            type: "array",
            minItems: 6,
            maxItems: 14,
            items: PRESENTATION_SLIDE_SCHEMA,
          },
        },
      },
    },
  },
} as const;

/**
 * CDF presentation.storyline — LLM structured output aligned with
 * PresentationStorylineData (artifact validator SoT remains in cdf/artifacts).
 */
export const PRESENTATION_STORYLINE_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaId", "sections", "slides"],
  properties: {
    schemaId: {
      type: "string",
      enum: ["unagency.presentation.storyline.v1"],
    },
    objective: { type: "string" },
    audience: { type: "string" },
    narrativeStrategy: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "order", "slideIds"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string" },
          order: { type: "integer" },
          slideIds: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    slides: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "order", "title"],
        properties: {
          id: { type: "string" },
          order: { type: "integer" },
          title: { type: "string" },
          purpose: { type: "string" },
          keyMessage: { type: "string" },
          sectionId: { type: "string" },
          transitionNote: { type: "string" },
        },
      },
    },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "summary"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;

/**
 * CDF presentation.slide-content — LLM structured output aligned with
 * PresentationSlideContentData.
 */
export const PRESENTATION_SLIDE_CONTENT_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaId", "slides"],
  properties: {
    schemaId: {
      type: "string",
      enum: ["unagency.presentation.slide_content.v1"],
    },
    slides: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "order", "title", "blocks"],
        properties: {
          id: { type: "string" },
          order: { type: "integer" },
          title: { type: "string" },
          subtitle: { type: "string" },
          notes: { type: "string" },
          blocks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "type", "content"],
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "heading",
                    "paragraph",
                    "bullets",
                    "table",
                    "metric",
                    "quote",
                    "callout",
                    "image_prompt",
                    "other",
                  ],
                },
                content: { type: "string" },
                hierarchy: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
} as const;
