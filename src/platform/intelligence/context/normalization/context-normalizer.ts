/**
 * Context normalizer — language, locale, currency, dates, identifiers, metadata.
 */

import type { IntelligenceContext } from "../contracts/intelligence-context";
import type { IContextNormalizer } from "../interfaces/normalization";

export class ContextNormalizer implements IContextNormalizer {
  normalize(context: IntelligenceContext): IntelligenceContext {
    const language = normalizeLanguage(context.language.language);
    const locale = normalizeLocale(context.locale.locale);
    const currency = normalizeCurrency(context.locale.currency);
    const timeZone = normalizeTimeZone(context.timeZone.timeZone);

    return {
      ...context,
      organization: {
        ...context.organization,
        organizationId: String(context.organization.organizationId).trim(),
        name: context.organization.name?.trim(),
      },
      workspace: {
        ...context.workspace,
        workspaceId: String(context.workspace.workspaceId).trim(),
        name: context.workspace.name?.trim(),
      },
      language: {
        ...context.language,
        language,
        fallbackLanguage: normalizeLanguage(
          context.language.fallbackLanguage ?? "en"
        ),
      },
      locale: {
        locale,
        currency,
      },
      timeZone: {
        timeZone,
      },
      capability: {
        ...context.capability,
        capabilityId: String(context.capability.capabilityId).trim(),
        capabilityVersion: context.capability.capabilityVersion?.trim(),
      },
      metadata: {
        ...context.metadata,
        attributes: normalizeMetadata(context.metadata.attributes),
      },
    };
  }
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase().slice(0, 8);
}

function normalizeLocale(value: string): string {
  const trimmed = value.trim().replace("_", "-");
  const parts = trimmed.split("-");
  if (parts.length === 1) {
    return parts[0]!.toLowerCase();
  }
  return `${parts[0]!.toLowerCase()}-${parts[1]!.toUpperCase()}`;
}

function normalizeCurrency(value?: string): string | undefined {
  return value ? value.trim().toUpperCase() : undefined;
}

function normalizeTimeZone(value: string): string {
  return value.trim() || "UTC";
}

function normalizeMetadata(
  attributes?: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> | undefined {
  if (!attributes) return undefined;
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(attributes)) {
    normalized[key.trim()] = typeof val === "string" ? val.trim() : val;
  }
  return normalized;
}
