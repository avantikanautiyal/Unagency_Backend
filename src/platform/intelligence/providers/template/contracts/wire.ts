/**
 * Opaque wire payload — provider-shaped data only, never vendor SDK types.
 */

export type TemplateWirePayload = Readonly<Record<string, unknown>>;
export type TemplateWireHeaders = Readonly<Record<string, string>>;
