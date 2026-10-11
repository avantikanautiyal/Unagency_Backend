/**
 * Which brand logo to use when several logo candidates exist.
 * Never guesses: the user is asked unless the brief itself names one logo.
 */

type DefaultLogoCandidateShape = {
  readonly name?: string;
  readonly folder?: string;
  readonly mimeType?: string;
  readonly tags?: readonly string[];
  readonly approvalStatus?: string;
};

const LOGO_VARIANT_REQUEST =
  /\b(secondary|alternate|monochrome|mono|black|white|inverse|reversed|icon|submark|favicon|horizontal|vertical|stacked|wordmark|emblem|badge)\s+(?:logo|mark|version)\b/i;

function logoCandidateText(candidate: DefaultLogoCandidateShape): string {
  return [candidate.name ?? "", candidate.folder ?? "", ...(candidate.tags ?? [])]
    .join(" ")
    .toLowerCase();
}

/**
 * A lone candidate is used as-is. With several, a candidate is returned only
 * when the brief names a specific variant (e.g. "secondary logo") that matches
 * exactly one of them; otherwise `ask` is true and the user chooses.
 */
export function selectDefaultLogoCandidate<T extends DefaultLogoCandidateShape>(
  candidates: readonly T[],
  brief?: string
): { readonly candidate?: T; readonly ask: boolean } {
  if (candidates.length === 0) return { ask: false };
  if (candidates.length === 1) return { candidate: candidates[0], ask: false };
  const variant = brief?.match(LOGO_VARIANT_REQUEST)?.[1]?.toLowerCase();
  if (variant && !/\bprimary\s+logo\b/i.test(brief ?? "")) {
    const matches = candidates.filter((c) => logoCandidateText(c).includes(variant));
    if (matches.length === 1) return { candidate: matches[0], ask: false };
  }
  return { ask: true };
}
