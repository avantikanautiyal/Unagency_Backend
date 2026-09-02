/**
 * Resolve brand logos from the product vault (MediaFile) when Brand Memory
 * has no canonical logo slot yet.
 */

import mongoose from "mongoose";
import MediaFile from "../models/mediaFile.model";
import type { KnowledgeResolveResult } from "../platform/os/creative/knowledge-resolver";
import type { BrandContextAssetRef } from "../platform/os/creative/brand-context-packet";

const LOGO_FOLDERS = new Set(["logos", "logo-versions"]);

export type VaultLogoCandidate = {
  readonly assetId: string;
  readonly name: string;
  readonly folder?: string;
  readonly approvalStatus: string;
  readonly updatedAt?: string;
};

export type BrandVaultLogoResolution = {
  readonly candidates: readonly VaultLogoCandidate[];
  readonly selectedAssetId?: string;
  readonly needsChoice: boolean;
};

function metadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string
): string {
  const raw = metadata?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function isLogoLikeAsset(doc: {
  folder?: string | null;
  tags?: string[] | null;
  fileName?: string | null;
  kind?: string | null;
  mimeType?: string | null;
}): boolean {
  if (doc.kind && doc.kind !== "image") {
    const mime = String(doc.mimeType ?? "").toLowerCase();
    if (!mime.startsWith("image/")) return false;
  }
  if (doc.folder && LOGO_FOLDERS.has(String(doc.folder))) return true;
  const tags = (doc.tags ?? []).map((t) => String(t).toLowerCase());
  if (
    tags.some(
      (t) =>
        t === "logo" ||
        t === "wordmark" ||
        t === "brand-mark" ||
        t === "output:logo"
    )
  ) {
    return true;
  }
  return /\blogo\b|\bwordmark\b/i.test(String(doc.fileName ?? ""));
}

function toCandidate(doc: {
  _id: mongoose.Types.ObjectId;
  fileName?: string | null;
  folder?: string | null;
  approvalStatus?: string | null;
  updatedAt?: Date | null;
  uploadedAt?: Date | null;
}): VaultLogoCandidate {
  const updated = doc.updatedAt ?? doc.uploadedAt;
  return {
    assetId: doc._id.toString(),
    name: String(doc.fileName ?? "Logo").trim() || "Logo",
    folder: doc.folder ? String(doc.folder) : undefined,
    approvalStatus: String(doc.approvalStatus ?? "none"),
    updatedAt: updated ? new Date(updated).toISOString() : undefined,
  };
}

function sortCandidates(
  a: VaultLogoCandidate,
  b: VaultLogoCandidate
): number {
  const approvedScore = (c: VaultLogoCandidate) =>
    c.approvalStatus === "approved" ? 1 : 0;
  const approvedDiff = approvedScore(b) - approvedScore(a);
  if (approvedDiff !== 0) return approvedDiff;
  const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
  const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
  return bt - at;
}

export function applyVaultLogoSelection(input: {
  readonly resolve: KnowledgeResolveResult;
  readonly assetId: string;
  readonly provenance?: string;
}): KnowledgeResolveResult {
  const assetId = input.assetId.trim();
  if (!assetId) return input.resolve;

  let missingRequiredSlots = input.resolve.missingRequiredSlots.filter(
    (slot) => slot !== "logo"
  );
  let assets: BrandContextAssetRef[] = [...input.resolve.assets];
  let provenanceParts = [...input.resolve.provenanceParts];
  const provenance = input.provenance ?? "Brand vault logo";

  if (!assets.some((a) => a.slot === "logo")) {
    assets.push({
      slot: "logo",
      version: 1,
      assetId,
      role: "logo",
    });
  }
  if (!provenanceParts.includes(provenance)) {
    provenanceParts = [...provenanceParts, provenance];
  }

  return {
    ...input.resolve,
    missingRequiredSlots,
    assets,
    provenanceParts,
  };
}

/**
 * Search the brand vault for logo assets.
 * - 0 candidates → caller keeps missing logo slot
 * - 1 candidate → auto-select
 * - 2+ → needsChoice (unless metadata already carries vaultLogoChoice)
 */
export async function resolveBrandVaultLogos(input: {
  readonly organizationId: string;
  readonly brandId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly profileLogoAssetId?: string;
}): Promise<BrandVaultLogoResolution> {
  const explicitChoice = metadataString(input.metadata, "vaultLogoChoice");
  if (explicitChoice) {
    return {
      candidates: [],
      selectedAssetId: explicitChoice,
      needsChoice: false,
    };
  }

  if (
    !mongoose.isValidObjectId(input.organizationId) ||
    !mongoose.isValidObjectId(input.brandId)
  ) {
    return { candidates: [], needsChoice: false };
  }

  const profileLogoId = input.profileLogoAssetId?.trim();

  if (profileLogoId && mongoose.isValidObjectId(profileLogoId)) {
    const profileDoc = await MediaFile.findOne({
      _id: new mongoose.Types.ObjectId(profileLogoId),
      organizationId: new mongoose.Types.ObjectId(input.organizationId),
      status: { $ne: "deleted" },
      storageKey: { $exists: true, $ne: null },
    })
      .select("fileName folder tags approvalStatus updatedAt uploadedAt kind mimeType")
      .lean();
    if (profileDoc) {
      return {
        candidates: [toCandidate(profileDoc)],
        selectedAssetId: profileDoc._id.toString(),
        needsChoice: false,
      };
    }
  }

  const orFilters: Record<string, unknown>[] = [
    { folder: { $in: [...LOGO_FOLDERS] } },
    { tags: { $in: ["logo", "wordmark", "brand-mark", "output:logo"] } },
    { fileName: { $regex: /logo|wordmark/i } },
  ];
  // Only fall back to generic brand images when profile logo is unset —
  // avoid treating every merchandise mockup as a logo candidate.
  if (profileLogoId && mongoose.isValidObjectId(profileLogoId)) {
    orFilters.push({ _id: new mongoose.Types.ObjectId(profileLogoId) });
  } else {
    // Keep mime filter narrow: logos folder / tags already cover most cases.
  }

  const docs = await MediaFile.find({
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    brandId: new mongoose.Types.ObjectId(input.brandId),
    status: { $ne: "deleted" },
    storageKey: { $exists: true, $ne: null },
    $or: orFilters,
  })
    .select("fileName folder tags approvalStatus updatedAt uploadedAt kind mimeType")
    .lean();

  const byId = new Map<string, VaultLogoCandidate>();
  for (const doc of docs) {
    if (!isLogoLikeAsset(doc) && doc._id.toString() !== profileLogoId) {
      continue;
    }
    byId.set(doc._id.toString(), toCandidate(doc));
  }

  const candidates = [...byId.values()].sort(sortCandidates);
  if (candidates.length === 0) {
    return { candidates: [], needsChoice: false };
  }
  if (candidates.length === 1) {
    return {
      candidates,
      selectedAssetId: candidates[0]!.assetId,
      needsChoice: false,
    };
  }

  const approved = candidates.filter((c) => c.approvalStatus === "approved");
  if (approved.length === 1) {
    return {
      candidates,
      selectedAssetId: approved[0]!.assetId,
      needsChoice: false,
    };
  }

  if (profileLogoId) {
    const profileMatch = candidates.find((c) => c.assetId === profileLogoId);
    if (profileMatch) {
      return {
        candidates,
        selectedAssetId: profileMatch.assetId,
        needsChoice: false,
      };
    }
  }

  return { candidates, needsChoice: true };
}
