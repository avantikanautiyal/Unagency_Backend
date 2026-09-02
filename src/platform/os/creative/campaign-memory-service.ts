/**
 * Track A Phase A5 — campaign compounding service.
 * Approved packs → Working campaign memory; selection signals; rebrand archive.
 */

import { logOsExecutionEvent } from "../observability/execution-log";
import type { BrandMemorySlotEntry, BrandMemorySlotKey } from "./brand-memory-slots";
import {
  defaultBrandMemoryStore,
  type IBrandMemoryStore,
} from "./brand-memory-store";
import {
  defaultCampaignMemoryStore,
  type CampaignPack,
  type CampaignSlotPointer,
  type ICampaignMemoryStore,
  type SelectionSignal,
  type SelectionSignalKind,
} from "./campaign-memory";
import {
  getContinuityLayerFlag,
  parseContinuityRolloutEnv,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { continuityLayerAffectsGeneration } from "./continuity-layer-flags";

export function resolveCampaignMemoryRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  return (
    parseContinuityRolloutEnv(env.CONTINUITY_CAMPAIGN_MEMORY) ??
    getContinuityLayerFlag("CampaignMemory")?.rollout ??
    "off"
  );
}

export interface PromotePackToCampaignInput {
  readonly organizationId: string;
  readonly brandId: string;
  readonly campaignId?: string;
  readonly title?: string;
  readonly executionId: string;
  readonly packId?: string;
  readonly leafAssetIds?: readonly string[];
  readonly slotPointers?: readonly CampaignSlotPointer[];
  readonly nowIso: string;
  readonly createId?: (prefix: string) => string;
}

export interface RecordSelectionSignalInput {
  readonly organizationId: string;
  readonly brandId: string;
  readonly campaignId?: string;
  readonly executionId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly assetId?: string;
  readonly slotKey?: BrandMemorySlotKey;
  readonly service?: string;
  readonly kind?: SelectionSignalKind;
  readonly nowIso: string;
  readonly createId?: (prefix: string) => string;
}

export interface ArchiveCanonicalSetInput {
  readonly organizationId: string;
  readonly brandId: string;
  readonly executionId: string;
  readonly reason?: string;
  readonly nowIso: string;
}

export interface ResolveCampaignForBindInput {
  readonly organizationId: string;
  readonly brandId: string;
  readonly campaignId?: string;
}

export class CampaignMemoryService {
  constructor(
    private readonly campaignStore: ICampaignMemoryStore = defaultCampaignMemoryStore,
    private readonly brandStore: IBrandMemoryStore = defaultBrandMemoryStore,
    private readonly rolloutResolver: () => ContinuityLayerRollout = resolveCampaignMemoryRollout
  ) {}

  async promotePackToWorking(
    input: PromotePackToCampaignInput
  ): Promise<CampaignPack | null> {
    const rollout = this.rolloutResolver();
    if (rollout === "off") return null;

    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const campaignId =
      input.campaignId?.trim() || createId("campaign");

    const existing = await this.campaignStore.getPack(
      campaignId,
      input.organizationId
    );

    const pack: CampaignPack = {
      campaignId,
      brandId: input.brandId,
      organizationId: input.organizationId,
      title: input.title ?? existing?.title,
      status: "working",
      leafAssetIds: [
        ...new Set([
          ...(existing?.leafAssetIds ?? []),
          ...(input.leafAssetIds ?? []),
        ]),
      ],
      slotPointers: input.slotPointers?.length
        ? input.slotPointers
        : existing?.slotPointers ?? [],
      selectionSignalIds: existing?.selectionSignalIds ?? [],
      sourcePackId: input.packId ?? existing?.sourcePackId,
      createdAt: existing?.createdAt ?? input.nowIso,
      updatedAt: input.nowIso,
    };

    logOsExecutionEvent("campaign_memory.promote_pack", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: rollout === "shadow" ? "shadow" : "persisted",
      capabilityId: campaignId,
    });

    if (rollout === "shadow") {
      return { ...pack, status: "working" };
    }

    // Archive prior active working pack for this brand (one active look).
    const prior = await this.campaignStore.getActiveWorkingPack(
      input.brandId,
      input.organizationId
    );
    if (prior && prior.campaignId !== campaignId) {
      await this.campaignStore.putPack({
        ...prior,
        status: "archived",
        updatedAt: input.nowIso,
        archivedAt: input.nowIso,
      });
    }

    // Mirror campaignLook into Working brand memory when a pointer exists.
    const look = pack.slotPointers.find((p) => p.slotKey === "campaignLook");
    if (look?.assetId && continuityLayerAffectsGeneration(rollout)) {
      const entry: BrandMemorySlotEntry = {
        brandId: input.brandId,
        organizationId: input.organizationId,
        slotKey: "campaignLook",
        tier: "working",
        version: look.version,
        assetId: look.assetId,
        facts: { campaignId },
        source: {
          kind: "approval",
          refId: `campaign:${campaignId}`,
          at: input.nowIso,
        },
        provenance: look.provenance,
        createdAt: input.nowIso,
      };
      const prevWorking = await this.brandStore.getWorking(
        input.brandId,
        input.organizationId,
        "campaignLook"
      );
      if (prevWorking && prevWorking.source.refId !== entry.source.refId) {
        await this.brandStore.put({
          ...prevWorking,
          tier: "archive",
          supersededAt: input.nowIso,
        });
        await this.brandStore.clearHead(
          input.brandId,
          input.organizationId,
          "campaignLook",
          "working"
        );
      }
      await this.brandStore.put(entry);
    }

    return this.campaignStore.putPack(pack);
  }

  async recordSelectionSignal(
    input: RecordSelectionSignalInput
  ): Promise<SelectionSignal | null> {
    const rollout = this.rolloutResolver();
    if (rollout === "off") return null;

    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const signal: SelectionSignal = {
      signalId: createId("sel"),
      organizationId: input.organizationId,
      brandId: input.brandId,
      campaignId: input.campaignId,
      executionId: input.executionId,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      assetId: input.assetId,
      slotKey: input.slotKey,
      service: input.service,
      kind: input.kind ?? "human_pick",
      selectedAt: input.nowIso,
    };

    logOsExecutionEvent("campaign_memory.selection", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: rollout === "shadow" ? "shadow" : "persisted",
      capabilityId: signal.kind,
    });

    if (rollout === "shadow") return signal;

    await this.campaignStore.putSignal(signal);

    if (input.campaignId) {
      const pack = await this.campaignStore.getPack(
        input.campaignId,
        input.organizationId
      );
      if (pack) {
        await this.campaignStore.putPack({
          ...pack,
          selectionSignalIds: [
            ...new Set([...pack.selectionSignalIds, signal.signalId]),
          ],
          updatedAt: input.nowIso,
        });
      }
    }

    return signal;
  }

  /**
   * Rebrand: archive all canonical heads so old identity cannot mix with new.
   */
  async archiveCanonicalSet(
    input: ArchiveCanonicalSetInput
  ): Promise<{ readonly archivedSlots: readonly BrandMemorySlotKey[] } | null> {
    const rollout = this.rolloutResolver();
    if (rollout === "off") return null;

    const knownSlots: BrandMemorySlotKey[] = [
      "logo",
      "wordmark",
      "icon",
      "colors",
      "type",
      "voice",
      "photographyStyle",
      "productHero",
      "campaignLook",
      "negatives",
    ];
    const archivedSlots: BrandMemorySlotKey[] = [];

    for (const slotKey of knownSlots) {
      const canonical = await this.brandStore.getCanonical(
        input.brandId,
        input.organizationId,
        slotKey
      );
      if (!canonical) continue;
      archivedSlots.push(slotKey);
      if (continuityLayerAffectsGeneration(rollout)) {
        await this.brandStore.put({
          ...canonical,
          tier: "archive",
          supersededAt: input.nowIso,
          facts: {
            ...(canonical.facts ?? {}),
            rebrandReason: input.reason ?? "rebrand",
          },
        });
        await this.brandStore.clearHead(
          input.brandId,
          input.organizationId,
          slotKey,
          "canonical"
        );
      }
    }

    // Archive active campaign packs for the brand.
    const packs = await this.campaignStore.listPacks(
      input.brandId,
      input.organizationId
    );
    if (continuityLayerAffectsGeneration(rollout)) {
      for (const pack of packs) {
        if (pack.status === "working") {
          await this.campaignStore.putPack({
            ...pack,
            status: "archived",
            updatedAt: input.nowIso,
            archivedAt: input.nowIso,
          });
        }
      }
    }

    logOsExecutionEvent("campaign_memory.rebrand_archive", {
      requestId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      status: rollout === "shadow" ? "shadow" : "persisted",
      capabilityId: input.brandId,
    });

    return { archivedSlots };
  }

  async resolveCampaignForBind(
    input: ResolveCampaignForBindInput
  ): Promise<CampaignPack | undefined> {
    const rollout = this.rolloutResolver();
    if (rollout === "off") return undefined;
    if (input.campaignId?.trim()) {
      return this.campaignStore.getPack(
        input.campaignId.trim(),
        input.organizationId
      );
    }
    return this.campaignStore.getActiveWorkingPack(
      input.brandId,
      input.organizationId
    );
  }
}

export const defaultCampaignMemoryService = new CampaignMemoryService();
