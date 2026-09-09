/**
 * EmailPlan JSON schema — authoritative for email / newsletter creates.
 * Mirrors FE EMAIL_PLAN_STRUCTURED_SCHEMA.
 */

export const EMAIL_PLAN_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subject", "preheader", "html", "textFallback"],
  properties: {
    title: { type: "string" },
    subject: { type: "string" },
    preheader: { type: "string" },
    html: { type: "string" },
    textFallback: { type: "string" },
  },
} as const;
