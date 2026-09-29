/**
 * Declarative structured contract for website page-structure deliverables.
 *
 * Registered by contract name (SCHEMA_BY_CONTRACT_NAME) and declared on the
 * phase via structuredOutputContract — not selected by serviceId/phaseId
 * runtime branches.
 *
 * Consumes approved sitemap semantics (page ids / hierarchy) as upstream
 * context; emits its own canonical page → section → block structure for
 * downstream wireframe / UI phases.
 */

export const CDF_WEBSITE_PAGE_STRUCTURE_CONTRACT_NAME =
  "CdfWebsitePageStructure" as const;

export const CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA_ID =
  "unagency.cdf.website_page_structure.v1" as const;

const CONTENT_BLOCK = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "summary"],
  properties: {
    id: { type: "string" },
    kind: { type: "string" },
    summary: { type: "string" },
    order: { type: "integer" },
  },
} as const;

const PAGE_SECTION = {
  type: "object",
  additionalProperties: false,
  required: ["id", "heading"],
  properties: {
    id: { type: "string" },
    heading: { type: "string" },
    purpose: { type: "string" },
    order: { type: "integer" },
    contentBlocks: {
      type: "array",
      items: CONTENT_BLOCK,
    },
  },
} as const;

const STRUCTURED_PAGE = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "sections"],
  properties: {
    /** Stable page id — should correlate with upstream sitemap page id when present. */
    id: { type: "string" },
    label: { type: "string" },
    path: { type: "string" },
    purpose: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: PAGE_SECTION,
    },
  },
} as const;

/**
 * Page structure deliverable: each sitemap page expanded into ordered sections
 * (and optional content blocks) with stable identifiers for wireframe handoff.
 */
export const CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pages", "pageCount"],
  properties: {
    schemaId: {
      type: "string",
      enum: [CDF_WEBSITE_PAGE_STRUCTURE_SCHEMA_ID],
    },
    type: { type: "string" },
    deliverable: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    pages: {
      type: "array",
      minItems: 1,
      items: STRUCTURED_PAGE,
    },
    pageCount: { type: "integer" },
    globalElements: { type: "string" },
    navigationNotes: { type: "string" },
    openItemsForApproval: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
} as const;
