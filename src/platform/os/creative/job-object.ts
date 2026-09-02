/**
 * Track B Phase B0 — Job Object + fact ledger + creative route contracts.
 * Types/docs only — no create-path runtime. User brief stays immutable (L1).
 */

import type { BrandMemorySlotKey } from "./brand-memory-slots";

/** Fact trust labels — shared Track A + B. */
export type JobFactLabel =
  | "VERIFIED"
  | "OBSERVED"
  | "INFERRED"
  | "ASSUMPTION"
  | "MUST_CONFIRM";

export interface JobFactV0 {
  readonly key: string;
  readonly value: string;
  readonly label: JobFactLabel;
  readonly provenance?: string;
  readonly slotKey?: BrandMemorySlotKey;
}

export type JobBlockerKind =
  | "legal_claim"
  | "product_fact"
  | "dieline"
  | "regulatory"
  | "other";

export interface JobBlockerV0 {
  readonly id: string;
  readonly kind: JobBlockerKind;
  readonly prompt: string;
}

/** Think / feel / do comms frame. */
export interface JobCommsFrameV0 {
  readonly think?: string;
  readonly feel?: string;
  readonly do?: string;
}

/** Category codes to keep vs deliberately break. */
export interface JobCategoryCodesV0 {
  readonly keep?: readonly string[];
  readonly break?: readonly string[];
}

/**
 * Job Object v0 — internal structured job; client sees `understoodBrief` only.
 * Must not become a prompt dump (roadmap §8.4).
 */
export interface JobObjectV0 {
  readonly schemaVersion: "v0";
  readonly jobId?: string;
  readonly brandId?: string;
  readonly organizationId?: string;
  /** Original user input — immutable. */
  readonly userBrief: string;
  /** Client-visible “what we understood”. */
  readonly understoodBrief: string;
  readonly audience?: string;
  readonly commsFrame?: JobCommsFrameV0;
  readonly hierarchy?: readonly string[];
  readonly categoryCodes?: JobCategoryCodesV0;
  readonly facts: readonly JobFactV0[];
  readonly blockers?: readonly JobBlockerV0[];
  readonly service?: string;
  readonly deliverableLabel?: string;
  readonly intentTags?: readonly string[];
  readonly createdAt?: string;
}

/** Creative territory frame for 3-route jobs (Track B3). */
export type CreativeTerritoryV0 = "iconic" | "distinctive" | "elevated";

/**
 * Per-route production object — feeds thin generate, not a mega-prompt.
 */
export interface CreativeRouteObjectV0 {
  readonly schemaVersion: "v0";
  readonly territory: CreativeTerritoryV0;
  readonly title: string;
  readonly rationale?: string;
  readonly productionPrompt: string;
  readonly providerPrompts?: Readonly<Record<string, string>>;
  readonly qaScore?: number;
  readonly qaNotes?: readonly string[];
}

export type PromptRegistryStatus =
  | "draft"
  | "bench"
  | "production"
  | "retired";

/**
 * Prompt Registry record stub (Track B2) — handbook SYS-FOUND-01.
 */
export interface PromptRegistryRecordV0 {
  readonly promptId: string;
  readonly version: string;
  readonly status: PromptRegistryStatus;
  readonly library: string;
  readonly type: string;
  readonly dependencies?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly requiredInputs?: readonly string[];
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly qualityRubric?: readonly string[];
  readonly benchmarkScore?: number;
  readonly rollbackVersion?: string;
}

export function emptyJobObject(input: {
  userBrief: string;
  understoodBrief?: string;
  brandId?: string;
}): JobObjectV0 {
  const brief = input.userBrief.trim();
  return {
    schemaVersion: "v0",
    userBrief: brief,
    understoodBrief: input.understoodBrief?.trim() || brief,
    brandId: input.brandId,
    facts: [],
  };
}

export function jobObjectBriefUnchanged(job: JobObjectV0): boolean {
  return job.userBrief === job.userBrief.trim();
}

export const CREATIVE_TERRITORIES_V0: readonly CreativeTerritoryV0[] =
  Object.freeze(["iconic", "distinctive", "elevated"]);

export const TERRITORY_LABELS: Readonly<
  Record<CreativeTerritoryV0, string>
> = Object.freeze({
  iconic: "Iconic — ownable, category-defining",
  distinctive: "Distinctive — break one code deliberately",
  elevated: "Elevated — premium craft and art direction",
});
