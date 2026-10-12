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

const RASTER_LOGO_MIME = new Set(["image/png", "image/jpeg", "image/jpg"]);
const NOT_A_LOGO = /\blogo[\s_-]*system\b/i;
const FORMAT_TOKEN = /[\s._-]*\(?\b(png|jpe?g|pdf|webp|svg)\b\)?/gi;

function logoFormat(candidate: DefaultLogoCandidateShape): "png" | "jpg" | "other" {
  const mime = (candidate.mimeType ?? "").toLowerCase();
  const name = (candidate.name ?? "").toLowerCase();
  if (mime) {
    if (!RASTER_LOGO_MIME.has(mime)) return "other";
    return mime === "image/png" ? "png" : "jpg";
  }
  if (/\bpdf\b|\bsvg\b|\bwebp\b/.test(name)) return "other";
  if (/\bpng\b/.test(name)) return "png";
  if (/\bjpe?g\b/.test(name)) return "jpg";
  // No format information at all — not known to be a PDF, so keep it.
  return "jpg";
}

/**
 * Logos a user can be asked to choose between: PNG / JPG only, never a
 * "logo system" sheet (that is a brand board, not the logo), and one entry per
 * logo when the same mark is stored in several formats (PNG preferred).
 */
export function selectableLogoCandidates<T extends DefaultLogoCandidateShape>(
  candidates: readonly T[]
): T[] {
  const byLogo = new Map<string, T>();
  for (const candidate of candidates) {
    const format = logoFormat(candidate);
    if (format === "other") continue;
    if (NOT_A_LOGO.test(logoCandidateText(candidate))) continue;
    const key =
      (candidate.name ?? "").toLowerCase().replace(FORMAT_TOKEN, "").trim() ||
      `unnamed:${byLogo.size}`;
    const existing = byLogo.get(key);
    if (!existing || (format === "png" && logoFormat(existing) !== "png")) {
      byLogo.set(key, candidate);
    }
  }
  if (byLogo.size > 0) return [...byLogo.values()];
  // No PNG/JPG at all: a brand whose only logo is another image type (e.g.
  // SVG) still has a logo. PDFs and logo-system sheets stay excluded.
  return candidates.filter(
    (candidate) =>
      (candidate.mimeType ?? "").toLowerCase().startsWith("image/") &&
      !NOT_A_LOGO.test(logoCandidateText(candidate))
  );
}
