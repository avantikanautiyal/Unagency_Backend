/**
 * Generic structured-approval emission schema for canonical CDF phases
 * whose ArtifactType is structured_doc and whose deliverable is a generic
 * approval document (brand platform, campaign strategy, etc.).
 *
 * Typed website deliverables (sitemap, page structure, wireframe) use
 * dedicated contract schemas declared on the phase — not this generic shape.
 *
 * Contract name is declarative (registry → SCHEMA_BY_CONTRACT_NAME).
 * Not service- or phase-specific.
 */

export const CDF_STRUCTURED_APPROVAL_DOC_CONTRACT_NAME =
  "CdfStructuredApprovalDoc" as const;

export const CDF_STRUCTURED_APPROVAL_DOC_SCHEMA_ID =
  "unagency.cdf.structured_approval.v1" as const;

/**
 * Stage-scoped approval document: title + summary + ordered sections.
 * Brand platform, campaign strategy, and similar approval docs fit this shape.
 */
export const CDF_STRUCTURED_APPROVAL_DOC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaId", "title", "summary", "sections"],
  properties: {
    schemaId: {
      type: "string",
      enum: [CDF_STRUCTURED_APPROVAL_DOC_SCHEMA_ID],
    },
    title: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "heading", "body"],
        properties: {
          id: { type: "string" },
          heading: { type: "string" },
          body: { type: "string" },
          order: { type: "integer" },
          children: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "heading", "body"],
              properties: {
                id: { type: "string" },
                heading: { type: "string" },
                body: { type: "string" },
                order: { type: "integer" },
              },
            },
          },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;
