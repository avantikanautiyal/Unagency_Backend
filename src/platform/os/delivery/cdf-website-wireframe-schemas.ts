/**
 * Declarative structured contract for website wireframe deliverables.
 *
 * Registered by contract name (SCHEMA_BY_CONTRACT_NAME) and declared on the
 * phase via structuredOutputContract — not selected by serviceId/phaseId
 * runtime branches.
 *
 * Consumes approved page-structure semantics as upstream context; emits
 * page → layout-block placement for UI-direction handoff.
 *
 * Distinct from CdfStructuredApprovalDoc (title/summary/sections) and from
 * CdfWebsitePageStructure (page → content sections). Wireframe adds layout
 * region / hierarchy placement on top of the approved structure.
 */

export const CDF_WEBSITE_WIREFRAME_CONTRACT_NAME =
  "CdfWebsiteWireframe" as const;

export const CDF_WEBSITE_WIREFRAME_SCHEMA_ID =
  "unagency.cdf.website_wireframe.v1" as const;

const LAYOUT_BLOCK = {
  type: "object",
  additionalProperties: false,
  required: ["id", "region", "purpose"],
  properties: {
    /** Stable block id within the page. */
    id: { type: "string" },
    /** Layout region / zone (e.g. header, hero, features, footer). */
    region: { type: "string" },
    /** What this block communicates or enables. */
    purpose: { type: "string" },
    hierarchy: { type: "string" },
    placement: { type: "string" },
    notes: { type: "string" },
  },
} as const;

const WIREFRAME_PAGE = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "blocks"],
  properties: {
    /** Stable page id — should correlate with upstream page-structure id. */
    id: { type: "string" },
    label: { type: "string" },
    path: { type: "string" },
    blocks: {
      type: "array",
      minItems: 1,
      items: LAYOUT_BLOCK,
    },
  },
} as const;

/**
 * Wireframe deliverable: each page resolved into ordered layout blocks
 * (regions) with stable identifiers for UI-route / homepage handoff.
 */
export const CDF_WEBSITE_WIREFRAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaId", "title", "summary", "pages"],
  properties: {
    schemaId: {
      type: "string",
      enum: [CDF_WEBSITE_WIREFRAME_SCHEMA_ID],
    },
    type: { type: "string" },
    deliverable: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    fidelity: { type: "string" },
    pages: {
      type: "array",
      minItems: 1,
      items: WIREFRAME_PAGE,
    },
    gridNotes: { type: "string" },
    responsiveNotes: { type: "string" },
    navigationNotes: { type: "string" },
    openItemsForApproval: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
} as const;
