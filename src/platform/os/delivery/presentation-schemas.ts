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
