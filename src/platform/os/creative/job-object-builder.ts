/**
 * Track B1 — Job Object builder (runtime, prepass sidecar).
 * Does not rewrite user brief (L1). Client sees understoodBrief only.
 */

import { extractBrandPreferencesFromPrompt } from "../../../services/brand-brief-extractor";
import type { JobFactV0, JobObjectV0 } from "./job-object";

export type BuildJobObjectInput = {
  readonly userBrief: string;
  readonly brandId?: string;
  readonly organizationId?: string;
  readonly service?: string;
  readonly deliverableLabel?: string;
  readonly brandName?: string;
  readonly brandProfile?: {
    readonly positioning?: string;
    readonly voice?: string;
    readonly industry?: string;
    readonly targetAudience?: string;
    readonly brandSummary?: string;
  };
  readonly priorBriefs?: readonly string[];
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildUnderstoodBrief(input: BuildJobObjectInput): string {
  const parts: string[] = [];
  if (input.brandName?.trim()) {
    parts.push(`${input.brandName.trim()} —`);
  }
  const profileLine =
    input.brandProfile?.positioning?.trim() ||
    input.brandProfile?.brandSummary?.trim();
  if (profileLine) parts.push(profileLine);
  const audience =
    input.brandProfile?.targetAudience?.trim() ||
    extractBrandPreferencesFromPrompt(input.userBrief).targetAudience;
  if (audience) parts.push(`Audience: ${audience}`);
  parts.push(`Job: ${truncate(input.userBrief, 160)}`);
  return parts.join(" ").trim();
}

function factsFromContext(input: BuildJobObjectInput): JobFactV0[] {
  const merged = [
    ...(input.priorBriefs ?? []),
    input.userBrief,
  ].filter(Boolean);
  const extracted = merged.reduce(
    (acc, brief) => {
      const row = extractBrandPreferencesFromPrompt(brief);
      return { ...acc, ...row, colors: [...(acc.colors ?? []), ...(row.colors ?? [])] };
    },
    {} as ReturnType<typeof extractBrandPreferencesFromPrompt>
  );

  const facts: JobFactV0[] = [];
  const add = (key: string, value: string | undefined, label: JobFactV0["label"]) => {
    const v = value?.trim();
    if (!v) return;
    if (facts.some((f) => f.key === key)) return;
    facts.push({ key, value: v, label, provenance: "job_object_builder" });
  };

  add("positioning", input.brandProfile?.positioning ?? extracted.positioning, "VERIFIED");
  add("voice", input.brandProfile?.voice, "VERIFIED");
  add("industry", input.brandProfile?.industry ?? extracted.industry, "OBSERVED");
  add("targetAudience", input.brandProfile?.targetAudience ?? extracted.targetAudience, "OBSERVED");
  add("brandSummary", input.brandProfile?.brandSummary ?? extracted.brandSummary, "INFERRED");
  if (extracted.colors?.length) {
    add("colors", extracted.colors.join(", "), "OBSERVED");
  }

  return facts.slice(0, 8);
}

export function buildJobObjectFromContext(input: BuildJobObjectInput): JobObjectV0 {
  const userBrief = input.userBrief.trim();
  return {
    schemaVersion: "v0",
    brandId: input.brandId,
    organizationId: input.organizationId,
    userBrief,
    understoodBrief: buildUnderstoodBrief(input),
    service: input.service,
    deliverableLabel: input.deliverableLabel,
    facts: factsFromContext(input),
    createdAt: new Date().toISOString(),
  };
}

export function jobObjectMetadataExtras(job: JobObjectV0): Record<string, unknown> {
  return {
    jobObject: job,
    understoodBrief: job.understoodBrief,
  };
}
