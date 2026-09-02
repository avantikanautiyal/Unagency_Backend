/**
 * Track A — Mongo-backed Brand Memory (persists across restarts).
 * Slots stored on brand.guidelinesProfile.brandMemoryV0.entries[].
 */

import mongoose from "mongoose";
import Brands from "../../../models/brand.model";
import type {
  BrandMemorySlotEntry,
  BrandMemorySlotKey,
  BrandMemoryTier,
} from "./brand-memory-slots";
import type { IBrandMemoryStore } from "./brand-memory-store";

const MEMORY_KEY = "brandMemoryV0";

type PersistedMemoryV0 = {
  entries?: BrandMemorySlotEntry[];
};

function slotMapKey(
  organizationId: string,
  brandId: string,
  slotKey: BrandMemorySlotKey
): string {
  return `${organizationId}|${brandId}|${slotKey}`;
}

function headKey(tier: BrandMemoryTier, slotKey: BrandMemorySlotKey): string {
  return `${tier}|${slotKey}`;
}

async function loadEntries(
  organizationId: string,
  brandId: string
): Promise<BrandMemorySlotEntry[]> {
  if (!mongoose.isValidObjectId(brandId) || !mongoose.isValidObjectId(organizationId)) {
    return [];
  }
  const doc = await Brands.findOne({
    _id: new mongoose.Types.ObjectId(brandId),
    organizationId: new mongoose.Types.ObjectId(organizationId),
    status: { $ne: "archived" },
  })
    .select("guidelinesProfile")
    .lean();
  const gp = (doc?.guidelinesProfile ?? {}) as Record<string, unknown>;
  const mem = gp[MEMORY_KEY] as PersistedMemoryV0 | undefined;
  return Array.isArray(mem?.entries) ? [...mem.entries] : [];
}

async function saveEntries(
  organizationId: string,
  brandId: string,
  entries: readonly BrandMemorySlotEntry[]
): Promise<void> {
  if (!mongoose.isValidObjectId(brandId) || !mongoose.isValidObjectId(organizationId)) {
    return;
  }
  await Brands.updateOne(
    {
      _id: new mongoose.Types.ObjectId(brandId),
      organizationId: new mongoose.Types.ObjectId(organizationId),
    },
    {
      $set: {
        [`guidelinesProfile.${MEMORY_KEY}`]: { entries: [...entries] },
      },
    }
  );
}

function pickHead(
  entries: readonly BrandMemorySlotEntry[],
  organizationId: string,
  brandId: string,
  slotKey: BrandMemorySlotKey,
  tier: BrandMemoryTier
): BrandMemorySlotEntry | undefined {
  const matches = entries.filter(
    (e) =>
      e.organizationId === organizationId &&
      e.brandId === brandId &&
      e.slotKey === slotKey &&
      e.tier === tier
  );
  if (!matches.length) return undefined;
  return matches.reduce((a, b) => (a.version >= b.version ? a : b));
}

export class MongoBrandMemoryStore implements IBrandMemoryStore {
  clear(): void {
    /* no-op — tests use InMemoryBrandMemoryStore */
  }

  async put(entry: BrandMemorySlotEntry): Promise<BrandMemorySlotEntry> {
    const entries = await loadEntries(entry.organizationId, entry.brandId);
    entries.push(entry);
    await saveEntries(entry.organizationId, entry.brandId, entries);
    return entry;
  }

  async getCanonical(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<BrandMemorySlotEntry | undefined> {
    const entries = await loadEntries(organizationId, brandId);
    return pickHead(entries, organizationId, brandId, slotKey, "canonical");
  }

  async getWorking(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<BrandMemorySlotEntry | undefined> {
    const entries = await loadEntries(organizationId, brandId);
    return pickHead(entries, organizationId, brandId, slotKey, "working");
  }

  async listSlotHistory(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<readonly BrandMemorySlotEntry[]> {
    const entries = await loadEntries(organizationId, brandId);
    return entries.filter(
      (e) =>
        e.brandId === brandId &&
        e.organizationId === organizationId &&
        e.slotKey === slotKey
    );
  }

  async findByArtifactPromotion(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey,
    artifactId: string,
    artifactVersion: number
  ): Promise<BrandMemorySlotEntry | undefined> {
    const refId = `${artifactId}@${artifactVersion}`;
    const entries = await loadEntries(organizationId, brandId);
    return entries.find(
      (e) =>
        e.slotKey === slotKey &&
        e.source.kind === "approval" &&
        e.source.refId === refId
    );
  }

  async clearHead(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey,
    tier: BrandMemoryTier
  ): Promise<void> {
    const entries = await loadEntries(organizationId, brandId);
    const hk = headKey(tier, slotKey);
    const filtered = entries.filter((e) => {
      if (e.slotKey !== slotKey || e.tier !== tier) return true;
      return `${e.organizationId}|${e.brandId}|${hk}` !== `${organizationId}|${brandId}|${hk}`;
    });
    await saveEntries(organizationId, brandId, filtered);
  }
}

export const mongoBrandMemoryStore = new MongoBrandMemoryStore();
