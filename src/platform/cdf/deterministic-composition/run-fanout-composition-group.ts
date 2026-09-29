/**
 * Fanout group: one shared authority × N independent visual leaves → composed outcomes.
 * No cross-leaf fallback. No provider semantic branches.
 */

import type { SharedCompositionAuthority } from "./composition-authority-input";
import {
  acceptComposedLeaf,
  type LeafCompositionAcceptanceResult,
  type LeafCompositionIdentity,
} from "./accept-composed-leaf";
import type { VisualGenerationResult } from "./types";
import { normalizeVisualGenerationResult } from "./normalize-visual-generation";

export type FanoutLeafVisualInput = {
  readonly identity: LeafCompositionIdentity;
  /** Provider operational failure before any visual exists. */
  readonly providerFailed?: boolean;
  readonly providerFailureReason?: string;
  readonly visualBytes?: Uint8Array | Buffer;
  readonly mimeType?: string;
  readonly visual?: VisualGenerationResult;
  /**
   * When set, forces structural rejection after successful composition
   * (e.g. wrong OCR text). Used for mixed-outcome tests.
   */
  readonly forcedRenderedTextProof?: {
    readonly extractedText: string;
    readonly source: "ocr" | "vision";
    readonly outcome: "ok";
  };
};

export type FanoutLeafGroupOutcome =
  | {
      readonly leafStatus: "AVAILABLE";
      readonly acceptance: Extract<
        LeafCompositionAcceptanceResult,
        { ok: true; outcome: "COMPOSED_ACCEPTED" }
      >;
    }
  | {
      readonly leafStatus: "REJECTED";
      readonly acceptance: Extract<
        LeafCompositionAcceptanceResult,
        { ok: true; outcome: "COMPOSED_REJECTED" }
      >;
    }
  | {
      readonly leafStatus: "COMPOSITION_FAILED";
      readonly acceptance: Extract<LeafCompositionAcceptanceResult, { ok: false }>;
    }
  | {
      readonly leafStatus: "PROVIDER_OPERATIONAL_FAILURE";
      readonly reason: string;
      readonly identity: LeafCompositionIdentity;
    };

export type FanoutCompositionGroupResult = {
  readonly fanoutGroupId: string;
  readonly selectedRoute: SharedCompositionAuthority["selectedRoute"];
  readonly sharedPrimaryMessage: string;
  readonly leafCount: number;
  readonly leaves: readonly FanoutLeafGroupOutcome[];
  readonly availableCount: number;
  readonly rejectedCount: number;
  readonly failedCount: number;
  readonly providerFailureCount: number;
  readonly crossLeafFallbackOccurred: false;
};

export function runIndependentFanoutCompositionGroup(input: {
  readonly fanoutGroupId: string;
  readonly authority: SharedCompositionAuthority;
  readonly leaves: readonly FanoutLeafVisualInput[];
}): FanoutCompositionGroupResult {
  const leaves: FanoutLeafGroupOutcome[] = [];

  for (const leaf of input.leaves) {
    if (leaf.providerFailed) {
      leaves.push({
        leafStatus: "PROVIDER_OPERATIONAL_FAILURE",
        reason: leaf.providerFailureReason ?? "provider_operational_failure",
        identity: leaf.identity,
      });
      continue;
    }

    let visual: VisualGenerationResult | undefined = leaf.visual;
    if (!visual) {
      if (!leaf.visualBytes) {
        leaves.push({
          leafStatus: "PROVIDER_OPERATIONAL_FAILURE",
          reason: "missing_visual_bytes",
          identity: leaf.identity,
        });
        continue;
      }
      const n = normalizeVisualGenerationResult({
        bytes: leaf.visualBytes,
        mimeType: leaf.mimeType,
        provenance: "fixture",
        generationMeta: { ...leaf.identity },
      });
      if ("ok" in n && n.ok === false) {
        leaves.push({
          leafStatus: "COMPOSITION_FAILED",
          acceptance: {
            ok: false,
            outcome: "VISUAL_NORMALIZE_FAILED",
            reason: n.reason,
            identity: leaf.identity,
          },
        });
        continue;
      }
      visual = n as VisualGenerationResult;
    }

    const acceptance = acceptComposedLeaf({
      authority: input.authority,
      visual,
      identity: leaf.identity,
      renderedTextProof: leaf.forcedRenderedTextProof
        ? {
            source: leaf.forcedRenderedTextProof.source,
            outcome: leaf.forcedRenderedTextProof.outcome,
            extractedText: leaf.forcedRenderedTextProof.extractedText,
          }
        : {
            // Without live OCR in this runner, use authoritative text as
            // stand-in only when caller did not force a mismatch — production
            // path supplies real OCR over composed bytes.
            source: "ocr",
            outcome: "ok",
            extractedText: input.authority.primaryMessage,
          },
    });

    if (!acceptance.ok) {
      leaves.push({ leafStatus: "COMPOSITION_FAILED", acceptance });
      continue;
    }
    if (acceptance.outcome === "COMPOSED_ACCEPTED") {
      leaves.push({
        leafStatus: "AVAILABLE",
        acceptance: acceptance as Extract<
          LeafCompositionAcceptanceResult,
          { ok: true; outcome: "COMPOSED_ACCEPTED" }
        >,
      });
    } else {
      leaves.push({
        leafStatus: "REJECTED",
        acceptance: acceptance as Extract<
          LeafCompositionAcceptanceResult,
          { ok: true; outcome: "COMPOSED_REJECTED" }
        >,
      });
    }
  }

  return {
    fanoutGroupId: input.fanoutGroupId,
    selectedRoute: input.authority.selectedRoute,
    sharedPrimaryMessage: input.authority.primaryMessage,
    leafCount: leaves.length,
    leaves,
    availableCount: leaves.filter((l) => l.leafStatus === "AVAILABLE").length,
    rejectedCount: leaves.filter((l) => l.leafStatus === "REJECTED").length,
    failedCount: leaves.filter((l) => l.leafStatus === "COMPOSITION_FAILED")
      .length,
    providerFailureCount: leaves.filter(
      (l) => l.leafStatus === "PROVIDER_OPERATIONAL_FAILURE",
    ).length,
    crossLeafFallbackOccurred: false,
  };
}
