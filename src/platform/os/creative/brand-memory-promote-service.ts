/**
 * Track A Phase A1 — Brand Memory promote / archive service.
 */

import { logOsExecutionEvent } from "../observability/execution-log";
import type { BrandMemorySlotEntry, BrandMemoryTier } from "./brand-memory-slots";
import {
  defaultBrandMemoryStore,
  type IBrandMemoryStore,
} from "./brand-memory-store";
import {
  resolveApprovePromoteRollout,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import type {
  IBrandMemoryPromoteService,
  PromoteOnApproveInput,
  PromoteOnApproveResult,
} from "./promote-on-approve";

export interface ArchiveOnRejectInput {
  readonly organizationId: string;
  readonly brandId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly executionId: string;
  readonly slotKey: PromoteOnApproveInput["slotKey"];
  readonly assetId?: string;
  readonly reason?: string;
  readonly nowIso: string;
}

function buildProvenance(input: {
  slotKey: string;
  version: number;
  approvedAt: string;
  tier: BrandMemoryTier;
}): string {
  const day = input.approvedAt.slice(0, 10);
  const label =
    input.slotKey.charAt(0).toUpperCase() + input.slotKey.slice(1);
  if (input.tier === "archive") {
    return `${label} v${input.version} archived (${day})`;
  }
  return `Using ${label} v${input.version} (approved ${day})`;
}

export class BrandMemoryPromoteService implements IBrandMemoryPromoteService {
  constructor(
    private readonly store: IBrandMemoryStore = defaultBrandMemoryStore,
    private readonly rolloutResolver: () => ContinuityLayerRollout = resolveApprovePromoteRollout
  ) {}

  /**
   * Promote an approved artifact into a memory slot.
   * Respects rollout: off → no-op; shadow → log only; canary/on → persist.
   */
  async promoteOnApprove(
    input: PromoteOnApproveInput
  ): Promise<PromoteOnApproveResult | null> {
    const rollout = this.rolloutResolver();
    if (rollout === "off") {
      return null;
    }

    const tier: BrandMemoryTier = input.tier ?? "canonical";
    const existing = await this.store.findByArtifactPromotion(
      input.brandId,
      input.organizationId,
      input.slotKey,
      input.artifactId,
      input.artifactVersion
    );
    if (existing) {
      return {
        brandId: existing.brandId,
        slotKey: existing.slotKey,
        tier: existing.tier,
        version: existing.version,
        provenance: existing.provenance,
        shadowed: rollout === "shadow",
        idempotentReplay: true,
      };
    }

    const history = await this.store.listSlotHistory(
      input.brandId,
      input.organizationId,
      input.slotKey
    );
    const sameTier = history.filter((h) => h.tier === tier);
    const nextVersion =
      sameTier.length === 0
        ? 1
        : Math.max(...sameTier.map((h) => h.version)) + 1;

    const entry: BrandMemorySlotEntry = {
      brandId: input.brandId,
      organizationId: input.organizationId,
      slotKey: input.slotKey,
      tier,
      version: nextVersion,
      assetId: input.assetId,
      facts: input.facts,
      source: {
        kind: "approval",
        refId: `${input.artifactId}@${input.artifactVersion}`,
        at: input.nowIso,
      },
      provenance: buildProvenance({
        slotKey: String(input.slotKey),
        version: nextVersion,
        approvedAt: input.nowIso,
        tier,
      }),
      createdAt: input.nowIso,
    };

    const result: PromoteOnApproveResult = {
      brandId: entry.brandId,
      slotKey: entry.slotKey,
      tier: entry.tier,
      version: entry.version,
      provenance: entry.provenance,
      shadowed: rollout === "shadow",
      idempotentReplay: false,
    };

    logOsExecutionEvent("brand_memory.promote", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: rollout === "shadow" ? "shadow" : "persisted",
      capabilityId: String(input.slotKey),
    });

    if (rollout === "shadow") {
      return result;
    }

    // Supersede previous head of same tier into archive copy
    const prev =
      tier === "canonical"
        ? await this.store.getCanonical(
            input.brandId,
            input.organizationId,
            input.slotKey
          )
        : await this.store.getWorking(
            input.brandId,
            input.organizationId,
            input.slotKey
          );
    if (prev && prev.source.refId !== entry.source.refId) {
      const archived: BrandMemorySlotEntry = {
        ...prev,
        tier: "archive",
        supersededAt: input.nowIso,
        provenance: buildProvenance({
          slotKey: String(prev.slotKey),
          version: prev.version,
          approvedAt: prev.createdAt,
          tier: "archive",
        }),
      };
      await this.store.put(archived);
      await this.store.clearHead(
        input.brandId,
        input.organizationId,
        input.slotKey,
        tier
      );
    }

    await this.store.put(entry);
    return result;
  }

  async archiveOnReject(
    input: ArchiveOnRejectInput
  ): Promise<PromoteOnApproveResult | null> {
    const rollout = this.rolloutResolver();
    if (rollout === "off") {
      return null;
    }

    const entry: BrandMemorySlotEntry = {
      brandId: input.brandId,
      organizationId: input.organizationId,
      slotKey: input.slotKey,
      tier: "archive",
      version: 1,
      assetId: input.assetId,
      facts: input.reason
        ? { rejectReason: input.reason }
        : undefined,
      source: {
        kind: "approval",
        refId: `${input.artifactId}@${input.artifactVersion}`,
        at: input.nowIso,
      },
      provenance: buildProvenance({
        slotKey: String(input.slotKey),
        version: 1,
        approvedAt: input.nowIso,
        tier: "archive",
      }),
      createdAt: input.nowIso,
    };

    const result: PromoteOnApproveResult = {
      brandId: entry.brandId,
      slotKey: entry.slotKey,
      tier: "archive",
      version: entry.version,
      provenance: entry.provenance,
      shadowed: rollout === "shadow",
      idempotentReplay: false,
    };

    logOsExecutionEvent("brand_memory.archive", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: rollout === "shadow" ? "shadow" : "persisted",
      capabilityId: String(input.slotKey),
    });

    if (rollout === "shadow") {
      return result;
    }

    await this.store.put(entry);
    return result;
  }

  async resolveCanonical(
    brandId: string,
    organizationId: string,
    slotKey: PromoteOnApproveInput["slotKey"]
  ): Promise<BrandMemorySlotEntry | undefined> {
    return this.store.getCanonical(brandId, organizationId, slotKey);
  }
}

export const defaultBrandMemoryPromoteService = new BrandMemoryPromoteService();
