/**
 * Track A Phase A1 — promote-on-approve contracts.
 *
 * Must not: invent slots, rewrite prompts, or promote UNAPPROVED drafts (L3).
 */

import type { BrandMemorySlotKey, BrandMemoryTier } from "./brand-memory-slots";

export interface PromoteOnApproveInput {
  readonly organizationId: string;
  readonly brandId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly executionId: string;
  readonly approvalReference: string;
  /** Target slot; resolver/UI may choose (e.g. logo vs productHero). */
  readonly slotKey: BrandMemorySlotKey;
  readonly tier?: BrandMemoryTier;
  /** ProductAsset id if the artifact bytes are already vaulted. */
  readonly assetId?: string;
  readonly facts?: Readonly<Record<string, string | readonly string[]>>;
  readonly nowIso: string;
}

export interface PromoteOnApproveResult {
  readonly brandId: string;
  readonly slotKey: BrandMemorySlotKey;
  readonly tier: BrandMemoryTier;
  readonly version: number;
  readonly provenance: string;
  /** True when rollout is shadow — computed but not persisted. */
  readonly shadowed?: boolean;
  /** True when the same artifact@version was already promoted. */
  readonly idempotentReplay?: boolean;
}

export interface IBrandMemoryPromoteService {
  promoteOnApprove(
    input: PromoteOnApproveInput
  ): Promise<PromoteOnApproveResult | null>;
}

/** Optional hint passed into artifact approve/revoke to drive memory writes. */
export interface ArtifactBrandMemoryHint {
  readonly brandId: string;
  readonly slotKey: BrandMemorySlotKey;
  readonly tier?: BrandMemoryTier;
  readonly assetId?: string;
  readonly facts?: Readonly<Record<string, string | readonly string[]>>;
  /** Phase A5 — promote into / record against a campaign pack. */
  readonly campaignId?: string;
  readonly campaignTitle?: string;
  readonly recordSelection?: boolean;
  readonly service?: string;
}
