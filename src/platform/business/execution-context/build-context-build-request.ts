/**
 * Maps resolved business context to ContextBuildRequest for Context Intelligence Engine.
 */

import type { ContextBuildRequest } from "../../intelligence/context/contracts/context-build-request";
import type { BrandBrainEnrichmentPackage } from "../brand-brain/contracts";
import type {
  ExecutionBusinessContext,
  ExecutionContextResolveInput,
} from "./contracts/execution-context";

export function buildContextBuildRequest(input: {
  resolveInput: ExecutionContextResolveInput;
  business: ExecutionBusinessContext;
  brandEnrichment?: BrandBrainEnrichmentPackage;
  contextSnapshotId: string;
}): ContextBuildRequest {
  const { resolveInput, business, brandEnrichment } = input;
  const brand = business.brand;
  const project = business.project;
  const campaign = business.campaign;

  const brandVoice =
    brand?.toneOfVoice ??
    extractEnrichmentString(brandEnrichment, "tone", "tone") ??
    extractEnrichmentString(brandEnrichment, "tone", "voice");

  const brandTone = extractEnrichmentString(brandEnrichment, "tone", "tone") ?? brandVoice;

  const brandGuidelines = [
    ...(brand?.brandRules ?? []),
    ...extractEnrichmentGuidelines(brandEnrichment),
  ];

  return {
    capabilityId: resolveInput.capabilityId ?? "text.generate",
    organizationId: business.identity.organizationId,
    workspaceId: business.identity.workspaceId ?? "ws_default",
    userId: business.identity.userId,
    projectId: project?.projectId,
    requirementId: resolveInput.scope?.requirementId,
    taskId: resolveInput.scope?.taskId,
    correlationId: resolveInput.correlationId ?? resolveInput.requestId,
    priority: "normal",
    language: resolveInput.hints?.language ?? "EN",
    locale: resolveInput.hints?.locale ?? "en_us",
    timeZone: "UTC",
    inputHints: {
      message: resolveInput.rawPrompt,
      task: resolveInput.rawPrompt,
      campaignObjective: campaign?.objective,
      projectName: project?.name,
    },
    attributes: {
      contextSnapshotId: input.contextSnapshotId,
      organizationName: business.organization.name,
      userDisplayName: business.user.displayName,
      userEmail: business.user.email,
      brandId: brand?.brandId,
      brandName: brand?.name,
      brandVoice,
      brandTone,
      brandGuidelines,
      brandColors: brand?.colorPalette ?? [],
      brandVisualIdentity: brand?.visualIdentity,
      campaignId: campaign?.campaignId,
      campaignObjective: campaign?.objective,
      campaignChannels: campaign?.channels,
      projectId: project?.projectId,
      projectName: project?.name,
      clientId: business.client?.clientId,
      policyRules: business.policy?.rules,
      policyConstraints: business.policy?.constraints,
      roles: business.identity.roles ?? [],
      permissions: business.identity.permissions ?? [],
      brandEnrichmentId: brandEnrichment?.enrichmentId,
      brandBrainVersion: brandEnrichment?.brainVersion,
    },
  };
}

function extractEnrichmentString(
  pkg: BrandBrainEnrichmentPackage | undefined,
  section: string,
  key: string
): string | undefined {
  if (!pkg) return undefined;
  const fact = pkg.facts.find((f: { section: string; key: string }) => f.section === section && f.key === key);
  if (!fact) return undefined;
  if (typeof fact.value === "string") return fact.value;
  if (Array.isArray(fact.value)) return fact.value.join(", ");
  return undefined;
}

function extractEnrichmentGuidelines(
  pkg: BrandBrainEnrichmentPackage | undefined
): string[] {
  if (!pkg) return [];
  return pkg.facts
    .filter((f: { section: string }) => f.section === "content_preferences" || f.section === "policies")
    .flatMap((f: { value: unknown }) => {
      if (typeof f.value === "string") return [f.value];
      if (Array.isArray(f.value)) return [...f.value];
      if (f.value && typeof f.value === "object" && "rules" in f.value) {
        const rules = (f.value as { rules?: readonly string[] }).rules;
        return rules ? [...rules] : [];
      }
      return [];
    });
}
