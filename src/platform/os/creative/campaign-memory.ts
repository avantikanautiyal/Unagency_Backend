/**
 * Track A Phase A5 — Campaign memory + selection signals.
 * Compounding: approved packs → Working campaign; humans pick what sticks.
 */

import type { BrandMemorySlotKey, BrandMemoryTier } from "./brand-memory-slots";

export type CampaignPackStatus = "working" | "archived";

export type SelectionSignalKind =
  | "human_pick"
  | "approved"
  | "rejected"
  | "pack_leaf_approved";

export interface SelectionSignal {
  readonly signalId: string;
  readonly organizationId: string;
  readonly brandId: string;
  readonly campaignId?: string;
  readonly executionId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly assetId?: string;
  readonly slotKey?: BrandMemorySlotKey;
  readonly service?: string;
  readonly kind: SelectionSignalKind;
  readonly selectedAt: string;
}

export interface CampaignSlotPointer {
  readonly slotKey: BrandMemorySlotKey;
  readonly version: number;
  readonly tier: BrandMemoryTier;
  readonly assetId?: string;
  readonly provenance: string;
}

export interface CampaignPack {
  readonly campaignId: string;
  readonly brandId: string;
  readonly organizationId: string;
  readonly title?: string;
  readonly status: CampaignPackStatus;
  readonly leafAssetIds: readonly string[];
  readonly slotPointers: readonly CampaignSlotPointer[];
  readonly selectionSignalIds: readonly string[];
  readonly sourcePackId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
}

export interface ICampaignMemoryStore {
  clear(): void;
  putPack(pack: CampaignPack): Promise<CampaignPack>;
  getPack(
    campaignId: string,
    organizationId: string
  ): Promise<CampaignPack | undefined>;
  getActiveWorkingPack(
    brandId: string,
    organizationId: string
  ): Promise<CampaignPack | undefined>;
  listPacks(
    brandId: string,
    organizationId: string
  ): Promise<readonly CampaignPack[]>;
  putSignal(signal: SelectionSignal): Promise<SelectionSignal>;
  listSignals(
    brandId: string,
    organizationId: string,
    campaignId?: string
  ): Promise<readonly SelectionSignal[]>;
}

function packKey(organizationId: string, campaignId: string): string {
  return `${organizationId}|${campaignId}`;
}

function brandIndexKey(organizationId: string, brandId: string): string {
  return `${organizationId}|${brandId}`;
}

export class InMemoryCampaignMemoryStore implements ICampaignMemoryStore {
  private readonly packs = new Map<string, CampaignPack>();
  private readonly byBrand = new Map<string, string[]>();
  private readonly signals = new Map<string, SelectionSignal>();
  private readonly signalsByBrand = new Map<string, string[]>();

  clear(): void {
    this.packs.clear();
    this.byBrand.clear();
    this.signals.clear();
    this.signalsByBrand.clear();
  }

  async putPack(pack: CampaignPack): Promise<CampaignPack> {
    const key = packKey(pack.organizationId, pack.campaignId);
    this.packs.set(key, pack);
    const bk = brandIndexKey(pack.organizationId, pack.brandId);
    const list = this.byBrand.get(bk) ?? [];
    if (!list.includes(pack.campaignId)) {
      this.byBrand.set(bk, [...list, pack.campaignId]);
    }
    return pack;
  }

  async getPack(
    campaignId: string,
    organizationId: string
  ): Promise<CampaignPack | undefined> {
    return this.packs.get(packKey(organizationId, campaignId));
  }

  async getActiveWorkingPack(
    brandId: string,
    organizationId: string
  ): Promise<CampaignPack | undefined> {
    const ids = this.byBrand.get(brandIndexKey(organizationId, brandId)) ?? [];
    let latest: CampaignPack | undefined;
    for (const id of ids) {
      const pack = await this.getPack(id, organizationId);
      if (!pack || pack.status !== "working") continue;
      if (!latest || pack.updatedAt > latest.updatedAt) latest = pack;
    }
    return latest;
  }

  async listPacks(
    brandId: string,
    organizationId: string
  ): Promise<readonly CampaignPack[]> {
    const ids = this.byBrand.get(brandIndexKey(organizationId, brandId)) ?? [];
    const out: CampaignPack[] = [];
    for (const id of ids) {
      const pack = await this.getPack(id, organizationId);
      if (pack) out.push(pack);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async putSignal(signal: SelectionSignal): Promise<SelectionSignal> {
    this.signals.set(signal.signalId, signal);
    const bk = brandIndexKey(signal.organizationId, signal.brandId);
    const list = this.signalsByBrand.get(bk) ?? [];
    if (!list.includes(signal.signalId)) {
      this.signalsByBrand.set(bk, [...list, signal.signalId]);
    }
    return signal;
  }

  async listSignals(
    brandId: string,
    organizationId: string,
    campaignId?: string
  ): Promise<readonly SelectionSignal[]> {
    const ids = this.signalsByBrand.get(brandIndexKey(organizationId, brandId)) ?? [];
    const out: SelectionSignal[] = [];
    for (const id of ids) {
      const s = this.signals.get(id);
      if (!s) continue;
      if (campaignId && s.campaignId !== campaignId) continue;
      out.push(s);
    }
    return out.sort((a, b) => b.selectedAt.localeCompare(a.selectedAt));
  }
}

export const defaultCampaignMemoryStore = new InMemoryCampaignMemoryStore();
