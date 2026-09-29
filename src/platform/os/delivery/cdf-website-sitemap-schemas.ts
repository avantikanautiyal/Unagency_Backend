/**
 * Declarative structured contract for website sitemap deliverables.
 *
 * Registered by contract name (SCHEMA_BY_CONTRACT_NAME) and declared on the
 * phase via structuredOutputContract — not selected by serviceId/phaseId
 * runtime branches.
 */

export const CDF_WEBSITE_SITEMAP_CONTRACT_NAME = "CdfWebsiteSitemap" as const;

export const CDF_WEBSITE_SITEMAP_SCHEMA_ID =
  "unagency.cdf.website_sitemap.v1" as const;

const SITEMAP_PAGE_NODE = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label"],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    path: { type: "string" },
    description: { type: "string" },
    children: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          path: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Corporate / marketing sitemap: hierarchy + navigation + approval open items.
 * Providers emit this shape for sitemap stages; validate against it strictly.
 */
export const CDF_WEBSITE_SITEMAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["siteHierarchy", "globalNavigation", "pageCount"],
  properties: {
    schemaId: {
      type: "string",
      enum: [CDF_WEBSITE_SITEMAP_SCHEMA_ID],
    },
    type: { type: "string" },
    deliverable: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    identityMark: { type: "string" },
    globalNavigation: {
      type: "array",
      minItems: 1,
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
    siteHierarchy: {
      type: "array",
      minItems: 1,
      items: SITEMAP_PAGE_NODE,
    },
    pageCount: { type: "integer" },
    globalElements: { type: "string" },
    transitionAndMotionSystem: { type: "string" },
    responsiveRules: { type: "string" },
    linkIntegrity: { type: "string" },
    openItemsForApproval: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
} as const;
