/**
 * Isolation check — unrelated DeckSpec content must remain identical (M6).
 */

import type { DeckSpec } from "../artifacts/presentation/types";
import { refinementError } from "./errors";
import type { CdfRefinementPatch } from "./types";

function allowedPaths(patch: CdfRefinementPatch): Set<string> {
  const set = new Set<string>();
  for (const op of patch.operations) {
    if (op.target.slideId && op.target.elementId) {
      set.add(`${op.target.slideId}.${op.target.elementId}`);
    }
  }
  return set;
}

/**
 * Compare before/after decks. Only patched element identities may differ.
 * Returns list of unexpected changed paths (empty = pass).
 */
export function findIsolationViolations(
  before: DeckSpec,
  after: DeckSpec,
  patch: CdfRefinementPatch,
): string[] {
  const allowed = allowedPaths(patch);
  const violations: string[] = [];

  if (before.metadata.title !== after.metadata.title) {
    // metadata title may change only if an op targeted it — we don't support that yet
    if (![...allowed].some((p) => p.includes("metadata"))) {
      // title in metadata is deck-level; allow only if patch scope is artifact and SET_TEXT on metadata — not used
      // Keep strict: metadata must match unless explicitly patched (never today)
      if (
        JSON.stringify(before.metadata) !== JSON.stringify(after.metadata)
      ) {
        violations.push("metadata");
      }
    }
  }

  if (
    JSON.stringify(before.designSystemRef) !==
    JSON.stringify(after.designSystemRef)
  ) {
    violations.push("designSystemRef");
  }

  const beforeSlides = [...before.slides].sort((a, b) => a.order - b.order);
  const afterSlides = [...after.slides].sort((a, b) => a.order - b.order);
  if (beforeSlides.length !== afterSlides.length) {
    violations.push("slides.length");
    return violations;
  }

  for (let i = 0; i < beforeSlides.length; i++) {
    const b = beforeSlides[i]!;
    const a = afterSlides[i]!;
    if (b.id !== a.id) {
      violations.push(`slide_order:${b.id}`);
      continue;
    }
    const bEls = [...b.elements].sort((x, y) => x.id.localeCompare(y.id));
    const aEls = [...a.elements].sort((x, y) => x.id.localeCompare(y.id));
    if (bEls.length !== aEls.length) {
      violations.push(`${b.id}.elements.length`);
      continue;
    }
    for (let j = 0; j < bEls.length; j++) {
      const be = bEls[j]!;
      const ae = aEls[j]!;
      if (be.id !== ae.id) {
        violations.push(`${b.id}.element_id_mismatch`);
        continue;
      }
      const path = `${b.id}.${be.id}`;
      if (allowed.has(path)) continue;
      if (JSON.stringify(be) !== JSON.stringify(ae)) {
        violations.push(path);
      }
    }
    // slide-level fields except elements
    const { elements: _be, ...bRest } = b;
    const { elements: _ae, ...aRest } = a;
    void _be;
    void _ae;
    const slideTouched = [...allowed].some((p) => p.startsWith(`${b.id}.`));
    if (!slideTouched && JSON.stringify(bRest) !== JSON.stringify(aRest)) {
      // background changes only via SET_BACKGROUND on slide — not in allowed element paths
      if (JSON.stringify(b.background) !== JSON.stringify(a.background)) {
        // only ok if patch has SET_BACKGROUND for this slide
        const bgOk = patch.operations.some(
          (op) =>
            op.op === "SET_BACKGROUND" && op.target.slideId === b.id,
        );
        if (!bgOk) violations.push(`${b.id}.background`);
      } else if (JSON.stringify(bRest) !== JSON.stringify(aRest)) {
        violations.push(`${b.id}.slide_meta`);
      }
    }
  }

  return violations;
}

export function assertIsolation(
  before: DeckSpec,
  after: DeckSpec,
  patch: CdfRefinementPatch,
): void {
  const violations = findIsolationViolations(before, after, patch);
  if (violations.length) {
    throw refinementError(
      "ISOLATION_VIOLATION",
      `Refinement modified unrelated paths: ${violations.join(", ")}`,
      { violations },
    );
  }
}
