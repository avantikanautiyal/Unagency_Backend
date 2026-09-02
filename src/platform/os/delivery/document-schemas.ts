/**
 * Canonical document structured schemas (mirrors packages/api structured-schemas).
 */

/** Multipage document structure → PDF/DOCX export. */
export const DOCUMENT_PLAN_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "sections"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      minItems: 3,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  },
} as const;
