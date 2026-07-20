/**
 * Middleware markers — gateway composes auth → RBAC → tenant → rate-limit → validate.
 */

export const MIDDLEWARE_PIPELINE = [
  "versioning",
  "validation",
  "authentication",
  "authorization",
  "tenant_isolation",
  "rate_limits",
  "controller",
  "serialization",
] as const;

export type MiddlewareStage = (typeof MIDDLEWARE_PIPELINE)[number];
