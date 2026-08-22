/**
 * Adapt StructuredBrief → Integration metadata / capability hints / prompt context.
 */

import type { StructuredBrief } from "../contracts/structured-brief";

/** Serializable brief snapshot for job metadata (no secrets). */
export function briefToMetadata(brief: StructuredBrief): Readonly<Record<string, unknown>> {
  return {
    structuredBrief: brief,
    briefId: brief.id,
    briefStatus: brief.status,
    briefIntent: brief.intent.kind,
    briefIntentConfidence: brief.intent.confidence,
    briefDeliverableTypes: brief.deliverables.map((d) => d.type),
    briefRequiredCapabilities: brief.requiredCapabilities.map((c) => c.capabilityId),
    briefPrimaryCapability: primaryCapabilityId(brief),
    briefMissingInformation: brief.missingInformation,
    capabilityHint: primaryCapabilityId(brief),
  };
}

export function primaryCapabilityId(brief: StructuredBrief): string {
  const primary = brief.requiredCapabilities.find((c) => c.role === "primary");
  return primary?.capabilityId ?? brief.requiredCapabilities[0]?.capabilityId ?? "text.generate";
}

/**
 * Compact structured context for Task Intelligence / providers.
 * User request stays first so providers and presentation still see the NL prompt;
 * Brief remains authoritative via metadata / capability hints.
 */
export function composeBriefAwarePrompt(
  rawUserPrompt: string,
  brief: StructuredBrief,
  enrichedProviderPrompt?: string
): string {
  const base = enrichedProviderPrompt?.trim() || rawUserPrompt;
  const briefBlock = [
    "[Structured Brief — authoritative OS intent]",
    `briefId=${brief.id}`,
    `status=${brief.status}`,
    `intent=${brief.intent.kind} (confidence=${brief.intent.confidence})`,
    `objective=${brief.objective}`,
    `deliverables=${brief.deliverables
      .map((d) =>
        [d.type, d.quantity != null ? `x${d.quantity}` : null, d.channel]
          .filter(Boolean)
          .join(":")
      )
      .join(", ")}`,
    `channels=${brief.channels.join(",") || "n/a"}`,
    `requiredCapabilities=${brief.requiredCapabilities
      .map((c) => `${c.capabilityId}:${c.role}`)
      .join(", ")}`,
    brief.audience ? `audience=${brief.audience}` : null,
    brief.constraints.length
      ? `constraints=${brief.constraints.map((c) => `${c.key}=${c.value}`).join("; ")}`
      : null,
    brief.missingInformation.length
      ? `missingInformation=${brief.missingInformation.map((m) => m.key).join(",")}`
      : null,
    brief.assumptions.length
      ? `assumptions=${brief.assumptions.map((a) => a.statement).join(" | ")}`
      : null,
  ]
    .filter((x): x is string => x != null)
    .join("\n");

  if (base !== rawUserPrompt && base.includes("[User prompt]")) {
    return `${base}\n\n${briefBlock}`;
  }
  if (base !== rawUserPrompt) {
    return `${base}\n\n${briefBlock}`;
  }
  return `${rawUserPrompt}\n\n${briefBlock}`;
}

export function scenarioHintFromBrief(brief: StructuredBrief): string {
  return brief.intent.kind;
}
