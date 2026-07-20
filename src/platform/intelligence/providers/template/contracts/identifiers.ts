/**
 * Template identifiers.
 */

export type TemplateProviderId = string & { readonly __brand: "TemplateProviderId" };
export type TemplateRequestId = string & { readonly __brand: "TemplateRequestId" };

export function asTemplateProviderId(value: string): TemplateProviderId {
  if (!value.trim()) throw new Error("TemplateProviderId cannot be empty");
  return value as TemplateProviderId;
}

export function asTemplateRequestId(value: string): TemplateRequestId {
  if (!value.trim()) throw new Error("TemplateRequestId cannot be empty");
  return value as TemplateRequestId;
}
