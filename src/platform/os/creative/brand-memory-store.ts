/**
 * Track A Phase A1 — in-memory Brand Memory slot store.
 * Product assets stay in the vault; this store holds versioned slot pointers + short facts.
 */

import type {
  BrandMemorySlotEntry,
  BrandMemorySlotKey,
  BrandMemoryTier,
} from "./brand-memory-slots";
import { mongoBrandMemoryStore } from "./mongo-brand-memory-store";

export interface IBrandMemoryStore {
  clear(): void;
  put(entry: BrandMemorySlotEntry): Promise<BrandMemorySlotEntry>;
  getCanonical(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<BrandMemorySlotEntry | undefined>;
  getWorking(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<BrandMemorySlotEntry | undefined>;
  listSlotHistory(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<readonly BrandMemorySlotEntry[]>;
  findByArtifactPromotion(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey,
    artifactId: string,
    artifactVersion: number
  ): Promise<BrandMemorySlotEntry | undefined>;
  clearHead(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey,
    tier: BrandMemoryTier
  ): Promise<void>;
}

function slotMapKey(
  organizationId: string,
  brandId: string,
  slotKey: BrandMemorySlotKey
): string {
  return `${organizationId}|${brandId}|${slotKey}`;
}

export class InMemoryBrandMemoryStore implements IBrandMemoryStore {
  /** Active canonical/working heads keyed by org|brand|slot */
  private readonly heads = new Map<string, BrandMemorySlotEntry>();
  /** Full history including archive */
  private readonly history = new Map<string, BrandMemorySlotEntry[]>();
  /** Idempotency: org|brand|slot|artifactId|artifactVersion → entry */
  private readonly byArtifact = new Map<string, BrandMemorySlotEntry>();

  clear(): void {
    this.heads.clear();
    this.history.clear();
    this.byArtifact.clear();
  }

  private artifactKey(
    organizationId: string,
    brandId: string,
    slotKey: BrandMemorySlotKey,
    artifactId: string,
    artifactVersion: number
  ): string {
    return `${organizationId}|${brandId}|${slotKey}|${artifactId}|${artifactVersion}`;
  }

  async put(entry: BrandMemorySlotEntry): Promise<BrandMemorySlotEntry> {
    const hk = slotMapKey(entry.organizationId, entry.brandId, entry.slotKey);
    const hist = [...(this.history.get(hk) ?? []), entry];
    this.history.set(hk, hist);

    if (entry.tier === "canonical" || entry.tier === "working") {
      this.heads.set(`${hk}|${entry.tier}`, entry);
    }

    if (entry.source.kind === "approval" && entry.source.refId) {
      const [artifactId, versionRaw] = entry.source.refId.split("@");
      const artifactVersion = Number(versionRaw);
      if (artifactId && Number.isFinite(artifactVersion)) {
        this.byArtifact.set(
          this.artifactKey(
            entry.organizationId,
            entry.brandId,
            entry.slotKey,
            artifactId,
            artifactVersion
          ),
          entry
        );
      }
    }

    return entry;
  }

  async getCanonical(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<BrandMemorySlotEntry | undefined> {
    return this.heads.get(
      `${slotMapKey(organizationId, brandId, slotKey)}|canonical`
    );
  }

  async getWorking(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<BrandMemorySlotEntry | undefined> {
    return this.heads.get(
      `${slotMapKey(organizationId, brandId, slotKey)}|working`
    );
  }

  async listSlotHistory(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey
  ): Promise<readonly BrandMemorySlotEntry[]> {
    return this.history.get(slotMapKey(organizationId, brandId, slotKey)) ?? [];
  }

  async findByArtifactPromotion(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey,
    artifactId: string,
    artifactVersion: number
  ): Promise<BrandMemorySlotEntry | undefined> {
    return this.byArtifact.get(
      this.artifactKey(
        organizationId,
        brandId,
        slotKey,
        artifactId,
        artifactVersion
      )
    );
  }

  /** Clear active head for a tier (used when superseding). */
  async clearHead(
    brandId: string,
    organizationId: string,
    slotKey: BrandMemorySlotKey,
    tier: BrandMemoryTier
  ): Promise<void> {
    this.heads.delete(`${slotMapKey(organizationId, brandId, slotKey)}|${tier}`);
  }
}

export const defaultBrandMemoryStore: IBrandMemoryStore =
  process.env.NODE_ENV === "test" ||
  process.env.BRAND_MEMORY_PERSIST === "memory" ||
  process.env.JEST_WORKER_ID
    ? new InMemoryBrandMemoryStore()
    : mongoBrandMemoryStore;

export function getBrandMemoryStore(): IBrandMemoryStore {
  return defaultBrandMemoryStore;
}
