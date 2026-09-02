/**
 * Pre-generation brand mismatch check.
 *
 * If Brand A is selected but the brief clearly refers to another tenant brand
 * (Brand B), ASK before any provider call. The user's choice becomes the sole
 * `execution.brandId` used for brand context and Vault ownership.
 *
 * Safety:
 * - Only matches brands from the caller-supplied tenant catalog (never cross-tenant).
 * - Comparison / example mentions do not count as the subject brand.
 * - Ambiguous references ASK rather than guess.
 * - Confirmed brandId is never overwritten by later extract / AI output.
 */

import mongoose from "mongoose";
import Brands from "../../../models/brand.model";
import { logOsExecutionEvent } from "../observability/execution-log";

export type TenantBrandRef = {
  readonly id: string;
  readonly name: string;
};

export type BrandMismatchChoiceId =
  | "use_detected"
  | "keep_selected"
  | "cancel";

export type BrandMismatchPrompt = {
  readonly kind: "brand_mismatch";
  readonly code: "CONTINUITY_BRAND_MISMATCH";
  readonly message: string;
  readonly choices: readonly {
    readonly id: BrandMismatchChoiceId | string;
    readonly label: string;
  }[];
  readonly details: {
    readonly selectedBrandId: string;
    readonly selectedBrandName: string;
    readonly detectedBrandId?: string;
    readonly detectedBrandName?: string;
    readonly candidateBrandIds?: readonly string[];
    readonly ambiguous?: boolean;
  };
};

export type BrandMismatchCheckResult =
  | {
      readonly ask: true;
      readonly prompt: BrandMismatchPrompt;
      readonly blockGenerate: true;
    }
  | {
      readonly ask: false;
      readonly brandId: string;
      readonly brandConfirmed: boolean;
      readonly choice?: BrandMismatchChoiceId;
      /** True when the user cancelled — caller must not generate. */
      readonly cancelled?: boolean;
    };

const MIN_BRAND_NAME_LEN = 3;

/** Phrases that mark a brand mention as comparison / example, not the job subject. */
const COMPARISON_PREFIX =
  String.raw`(?:like|unlike|similar\s+to|similar\s+as|compared\s+to|compared\s+with|versus|vs\.?|inspired\s+by|in\s+the\s+style\s+of|in\s+the\s+vein\s+of|rather\s+than|instead\s+of|better\s+than|worse\s+than|e\.g\.|eg\.?|for\s+example|such\s+as|not\s+like|as\s+opposed\s+to)`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * True when this match index sits in a comparison/example window
 * (e.g. "like Nike", "similar to Acme", "vs. BrandB").
 */
export function isComparisonBrandMention(
  brief: string,
  matchIndex: number,
  matchLength: number
): boolean {
  const before = brief.slice(Math.max(0, matchIndex - 48), matchIndex);
  const after = brief.slice(
    matchIndex + matchLength,
    matchIndex + matchLength + 24
  );

  const prefixRe = new RegExp(`${COMPARISON_PREFIX}\\s+$`, "i");
  if (prefixRe.test(before)) return true;

  // "Nike-style" / "Nike aesthetic" after a soft comparison cue earlier on the line
  if (
    /\b(style|aesthetic|vibes?|look|feel)\b/i.test(after) &&
    new RegExp(`${COMPARISON_PREFIX}\\b`, "i").test(before)
  ) {
    return true;
  }

  return false;
}

/**
 * Find non-comparison mentions of a brand name in the brief (word-boundary).
 */
export function findBrandMentions(
  brief: string,
  brandName: string
): { index: number; length: number; comparison: boolean }[] {
  const name = normalizeName(brandName);
  if (name.length < MIN_BRAND_NAME_LEN) return [];

  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
  const hits: { index: number; length: number; comparison: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(brief)) !== null) {
    hits.push({
      index: m.index,
      length: m[0].length,
      comparison: isComparisonBrandMention(brief, m.index, m[0].length),
    });
  }
  return hits;
}

export type BrandMismatchDetection =
  | { readonly kind: "none" }
  | {
      readonly kind: "mismatch";
      readonly selected: TenantBrandRef;
      readonly detected: TenantBrandRef;
    }
  | {
      readonly kind: "ambiguous";
      readonly selected: TenantBrandRef;
      readonly candidates: readonly TenantBrandRef[];
    };

/**
 * Detect whether the brief clearly refers to a different tenant brand than
 * the one currently selected. Catalog must already be tenant-scoped.
 */
export function detectBrandMismatchInBrief(input: {
  readonly brief: string;
  readonly selectedBrandId: string;
  readonly brands: readonly TenantBrandRef[];
}): BrandMismatchDetection {
  const brief = input.brief.trim();
  const selectedId = input.selectedBrandId.trim();
  if (!brief || !selectedId) return { kind: "none" };

  const brands = input.brands
    .map((b) => ({ id: b.id.trim(), name: normalizeName(b.name) }))
    .filter((b) => b.id && b.name.length >= MIN_BRAND_NAME_LEN);

  const selected =
    brands.find((b) => b.id === selectedId) ??
    ({ id: selectedId, name: "" } as TenantBrandRef);

  // Prefer longer names first so "Acme Labs" wins over "Acme".
  const ordered = [...brands].sort((a, b) => b.name.length - a.name.length);

  const subjectHits = new Map<string, TenantBrandRef>();
  const claimedRanges: { start: number; end: number }[] = [];

  for (const brand of ordered) {
    const mentions = findBrandMentions(brief, brand.name);
    for (const hit of mentions) {
      if (hit.comparison) continue;
      const overlaps = claimedRanges.some(
        (r) => hit.index < r.end && hit.index + hit.length > r.start
      );
      if (overlaps) continue;
      claimedRanges.push({ start: hit.index, end: hit.index + hit.length });
      subjectHits.set(brand.id, brand);
      break; // one subject hit is enough per brand
    }
  }

  const otherSubjects = [...subjectHits.values()].filter(
    (b) => b.id !== selectedId
  );

  if (otherSubjects.length === 0) return { kind: "none" };
  if (otherSubjects.length === 1) {
    return {
      kind: "mismatch",
      selected: selected.name
        ? selected
        : { id: selectedId, name: selectedId },
      detected: otherSubjects[0]!,
    };
  }

  return {
    kind: "ambiguous",
    selected: selected.name ? selected : { id: selectedId, name: selectedId },
    candidates: otherSubjects,
  };
}

export function clientBrandMismatchChoice(
  metadata: Readonly<Record<string, unknown>> | undefined
): BrandMismatchChoiceId | undefined {
  const raw =
    typeof metadata?.brandMismatchChoice === "string"
      ? metadata.brandMismatchChoice.trim()
      : typeof metadata?.continuityBrandMismatchChoice === "string"
        ? metadata.continuityBrandMismatchChoice.trim()
        : undefined;
  if (raw === "use_detected" || raw === "generate_detected") {
    return "use_detected";
  }
  if (
    raw === "keep_selected" ||
    raw === "continue_selected" ||
    raw === "keep_brand"
  ) {
    return "keep_selected";
  }
  if (raw === "cancel") return "cancel";
  return undefined;
}

function resolveSelectedName(
  selectedId: string,
  brands: readonly TenantBrandRef[],
  metadata?: Readonly<Record<string, unknown>>
): string {
  const fromCatalog = brands.find((b) => b.id === selectedId)?.name;
  if (fromCatalog) return fromCatalog;
  if (typeof metadata?.brandName === "string" && metadata.brandName.trim()) {
    return metadata.brandName.trim();
  }
  return "the selected brand";
}

function buildMismatchPrompt(input: {
  readonly selected: TenantBrandRef;
  readonly detected?: TenantBrandRef;
  readonly candidates?: readonly TenantBrandRef[];
}): BrandMismatchPrompt {
  const selectedName = input.selected.name || "the selected brand";

  if (input.detected) {
    const detectedName = input.detected.name;
    return {
      kind: "brand_mismatch",
      code: "CONTINUITY_BRAND_MISMATCH",
      message: `This request appears to be for ${detectedName}, but ${selectedName} is selected. Do you want to generate it for ${detectedName}?`,
      choices: [
        {
          id: "use_detected",
          label: `Generate for ${detectedName}`,
        },
        {
          id: "keep_selected",
          label: `Continue with ${selectedName}`,
        },
        { id: "cancel", label: "Cancel" },
      ],
      details: {
        selectedBrandId: input.selected.id,
        selectedBrandName: selectedName,
        detectedBrandId: input.detected.id,
        detectedBrandName: detectedName,
      },
    };
  }

  const candidates = input.candidates ?? [];
  const names = candidates.map((c) => c.name).join(", ");
  return {
    kind: "brand_mismatch",
    code: "CONTINUITY_BRAND_MISMATCH",
    message: `Your brief mentions more than one brand (${names}), but ${selectedName} is selected. Which brand should we generate for?`,
    choices: [
      ...candidates.map((c) => ({
        id: `use_brand:${c.id}`,
        label: `Generate for ${c.name}`,
      })),
      {
        id: "keep_selected",
        label: `Continue with ${selectedName}`,
      },
      { id: "cancel", label: "Cancel" },
    ],
    details: {
      selectedBrandId: input.selected.id,
      selectedBrandName: selectedName,
      candidateBrandIds: candidates.map((c) => c.id),
      ambiguous: true,
    },
  };
}

/**
 * List active brands for an organization (tenant-scoped). Never returns
 * brands from other tenants.
 */
export async function listActiveBrandsForOrganization(
  organizationId: string
): Promise<TenantBrandRef[]> {
  const orgId = organizationId.trim();
  if (!orgId || !mongoose.isValidObjectId(orgId)) return [];

  const docs = await Brands.find({
    organizationId: new mongoose.Types.ObjectId(orgId),
    status: "active",
  })
    .select({ _id: 1, name: 1 })
    .limit(200)
    .lean();

  return docs
    .map((d) => ({
      id: String(d._id),
      name: normalizeName(String(d.name ?? "")),
    }))
    .filter((b) => b.id && b.name);
}

/**
 * Resolve a confirmed brandId from metadata choice + detection.
 * Never accepts a brandId outside the tenant catalog.
 */
export function resolveBrandMismatchChoice(input: {
  readonly selectedBrandId: string;
  readonly brands: readonly TenantBrandRef[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly detection: BrandMismatchDetection;
}): {
  readonly brandId: string;
  readonly choice: BrandMismatchChoiceId | "use_brand";
  readonly cancelled: boolean;
  readonly resolved: boolean;
} | null {
  const choice = clientBrandMismatchChoice(input.metadata);
  const catalogIds = new Set(input.brands.map((b) => b.id));
  const selectedId = input.selectedBrandId.trim();

  // Explicit brand pick from ambiguous ASK: use_brand:<id>
  const rawChoice =
    typeof input.metadata?.brandMismatchChoice === "string"
      ? input.metadata.brandMismatchChoice.trim()
      : typeof input.metadata?.continuityBrandMismatchChoice === "string"
        ? input.metadata.continuityBrandMismatchChoice.trim()
        : "";
  if (rawChoice.startsWith("use_brand:")) {
    const id = rawChoice.slice("use_brand:".length).trim();
    if (id && catalogIds.has(id)) {
      return {
        brandId: id,
        choice: "use_brand",
        cancelled: false,
        resolved: true,
      };
    }
    // Cross-tenant or unknown id — refuse; keep selected and re-ask path.
    return null;
  }

  if (!choice) {
    // Client may have already stamped brandConfirmed + brandId after prior ASK.
    if (
      input.metadata?.brandConfirmed === true &&
      typeof input.metadata?.brandId === "string" &&
      input.metadata.brandId.trim() &&
      catalogIds.has(input.metadata.brandId.trim())
    ) {
      return {
        brandId: input.metadata.brandId.trim(),
        choice: "keep_selected",
        cancelled: false,
        resolved: true,
      };
    }
    return null;
  }

  if (choice === "cancel") {
    return {
      brandId: selectedId,
      choice: "cancel",
      cancelled: true,
      resolved: true,
    };
  }

  if (choice === "keep_selected") {
    return {
      brandId: selectedId,
      choice: "keep_selected",
      cancelled: false,
      resolved: true,
    };
  }

  // use_detected
  if (input.detection.kind === "mismatch") {
    const detectedId = input.detection.detected.id;
    if (catalogIds.has(detectedId)) {
      return {
        brandId: detectedId,
        choice: "use_detected",
        cancelled: false,
        resolved: true,
      };
    }
  }

  // Explicit override in metadata (FE stamped detected brandId) — tenant check.
  if (
    typeof input.metadata?.brandId === "string" &&
    input.metadata.brandId.trim() &&
    catalogIds.has(input.metadata.brandId.trim())
  ) {
    return {
      brandId: input.metadata.brandId.trim(),
      choice: "use_detected",
      cancelled: false,
      resolved: true,
    };
  }

  return null;
}

/**
 * Run brand mismatch check for create prepass.
 * When ASK is returned, caller must block before provider call.
 */
export async function runBrandMismatchCheck(input: {
  readonly brief: string;
  readonly brandId: string;
  readonly organizationId: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly listBrands?: (
    organizationId: string
  ) => Promise<readonly TenantBrandRef[]>;
}): Promise<BrandMismatchCheckResult | null> {
  const selectedBrandId = input.brandId.trim();
  if (!selectedBrandId || !input.brief.trim()) return null;

  const listBrands = input.listBrands ?? listActiveBrandsForOrganization;
  let brands: readonly TenantBrandRef[] = [];
  try {
    brands = await listBrands(input.organizationId);
  } catch {
    // Catalog failure must not invent brands or block matching flows.
    return null;
  }

  // Only brands in this org — drop any id that somehow isn't in the catalog
  // when we have a non-empty catalog (selected may still be used by id).
  const tenantBrands = brands.filter((b) => b.id && b.name);

  const detection = detectBrandMismatchInBrief({
    brief: input.brief,
    selectedBrandId,
    brands: tenantBrands,
  });

  const resolved = resolveBrandMismatchChoice({
    selectedBrandId,
    brands: tenantBrands,
    metadata: input.metadata,
    detection,
  });

  if (resolved?.cancelled) {
    return {
      ask: false,
      brandId: selectedBrandId,
      brandConfirmed: true,
      choice: "cancel",
      cancelled: true,
    };
  }

  if (resolved?.resolved) {
    return {
      ask: false,
      brandId: resolved.brandId,
      brandConfirmed: true,
      choice:
        resolved.choice === "use_brand" ? "use_detected" : resolved.choice,
    };
  }

  if (detection.kind === "none") {
    return {
      ask: false,
      brandId: selectedBrandId,
      brandConfirmed: input.metadata?.brandConfirmed === true,
    };
  }

  const selectedName = resolveSelectedName(
    selectedBrandId,
    tenantBrands,
    input.metadata
  );
  const selected: TenantBrandRef = {
    id: selectedBrandId,
    name: selectedName,
  };

  const prompt =
    detection.kind === "mismatch"
      ? buildMismatchPrompt({
          selected: {
            id: selectedBrandId,
            name: detection.selected.name || selectedName,
          },
          detected: detection.detected,
        })
      : buildMismatchPrompt({
          selected,
          candidates: detection.candidates,
        });

  logOsExecutionEvent("continuity.brand_mismatch", {
    requestId: input.executionId ?? "prepass",
    executionId: input.executionId ?? "prepass",
    organizationId: input.organizationId,
    status: "ask",
    capabilityId: prompt.code,
  });

  return {
    ask: true,
    prompt,
    blockGenerate: true,
  };
}

/**
 * Freeze confirmed brandId — later extract / AI must not overwrite ownership.
 */
export function applyConfirmedBrandId(
  metadata: Record<string, unknown> | undefined,
  brandId: string
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(metadata ?? {}),
    brandId,
    brandConfirmed: true,
  };
  // Ownership SoT is execution.brandId only — strip inferred ownership hints.
  delete next.inferredBrandId;
  delete next.detectedBrandId;
  return next;
}
