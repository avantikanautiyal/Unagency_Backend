/**
 * Declarative structured contract for website page-structure deliverables.
 *
 * Registered by contract name (SCHEMA_BY_CONTRACT_NAME) and declared on the
 * phase via structuredOutputContract — not selected by serviceId/phaseId
 * runtime branches.
 *
 * First Web Tech phase: owns the site map (pages, hierarchy, global
 * navigation) and the canonical page → section → block structure consumed by
 * the UI routes and complete-website phases.
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
    /** Stable page id — referenced by parentId and downstream page designs. */
    id: { type: "string" },
    label: { type: "string" },
    path: { type: "string" },
    /** Parent page id for nested pages; omit for top-level pages. */
    parentId: { type: "string" },
    purpose: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      items: PAGE_SECTION,
    },
  },
} as const;

/**
 * Page structure deliverable: every site page (with hierarchy and global
 * navigation) expanded into ordered sections and optional content blocks,
 * with stable identifiers for the complete-website handoff.
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
    globalNavigation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          label: { type: "string" },
          path: { type: "string" },
        },
      },
    },
    globalElements: { type: "string" },
    navigationNotes: { type: "string" },
    responsiveRules: { type: "string" },
    openItemsForApproval: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
} as const;
