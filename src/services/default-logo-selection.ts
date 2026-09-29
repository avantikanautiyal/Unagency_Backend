/**
 * Default brand logo for generation when several logo candidates exist.
 */

type DefaultLogoCandidateShape = {
  readonly name?: string;
  readonly folder?: string;
  readonly mimeType?: string;
  readonly tags?: readonly string[];
  readonly approvalStatus?: string;
};

const NON_PRIMARY_LOGO_HINT =
  /\b(system|sheet|guidelines?|mockups?|applications?|secondary|alternate|monochrome|mono|inverse|reversed|icon|favicon|submark)\b/;
const LOGO_VARIANT_REQUEST =
  /\b(secondary|alternate|monochrome|mono|black|white|inverse|reversed|icon|submark|favicon|horizontal|vertical|stacked|wordmark|emblem|badge)\s+(?:logo|mark|version)\b/i;

function logoCandidateText(candidate: DefaultLogoCandidateShape): string {
  return [candidate.name ?? "", candidate.folder ?? "", ...(candidate.tags ?? [])]
    .join(" ")
    .toLowerCase();
}

function logoCandidateScore(candidate: DefaultLogoCandidateShape): number {
  const text = logoCandidateText(candidate);
  const mime = (candidate.mimeType ?? "").toLowerCase();
  let score = 0;
  if (/\bprimary\b/.test(text)) score += 8;
  if (mime === "image/png" || /\bpng\b/.test(text)) score += 4;
  if (!NON_PRIMARY_LOGO_HINT.test(text)) score += 2;
  if (candidate.approvalStatus === "approved") score += 1;
  return score;
}

/**
 * The primary logo PNG, unless the brief names a specific variant
 * (e.g. "secondary logo"). `ask` is true only when the brief names a variant
 * that doesn't match exactly one candidate. Ties keep input order.
 */
export function selectDefaultLogoCandidate<T extends DefaultLogoCandidateShape>(
  candidates: readonly T[],
  brief?: string
): { readonly candidate?: T; readonly ask: boolean } {
  if (candidates.length === 0) return { ask: false };
  const variant = brief?.match(LOGO_VARIANT_REQUEST)?.[1]?.toLowerCase();
  if (variant && !/\bprimary\s+logo\b/i.test(brief ?? "")) {
    const matches = candidates.filter((c) => logoCandidateText(c).includes(variant));
    return matches.length === 1 ? { candidate: matches[0], ask: false } : { ask: true };
  }
  let best = candidates[0]!;
  let bestScore = logoCandidateScore(best);
  for (const candidate of candidates.slice(1)) {
    const score = logoCandidateScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return { candidate: best, ask: false };
}
