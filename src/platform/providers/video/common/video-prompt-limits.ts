/**
 * Provider video prompt length caps — enforce before vendor submit.
 */

export const VIDEO_PROMPT_CHAR_LIMITS: Readonly<Record<string, number>> = {
  kling: 2500,
  minimax: 3000,
  luma: 6000,
};

export function truncateVideoPrompt(prompt: string, vendorId: string): string {
  const limit = VIDEO_PROMPT_CHAR_LIMITS[vendorId];
  const trimmed = prompt.trim();
  if (!limit || trimmed.length <= limit) return trimmed;

  const suffix = " …";
  const maxBody = limit - suffix.length;
  const slice = trimmed.slice(0, maxBody);
  const lastBreak = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf(".\n"),
    slice.lastIndexOf("\n")
  );
  if (lastBreak > maxBody * 0.55) {
    return `${slice.slice(0, lastBreak + 1).trim()}${suffix}`;
  }
  return `${slice.trim()}${suffix}`;
}

/** Vendor APIs must fetch reference images over HTTP(S) — not data: URLs. */
export function isProviderFetchableImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}
