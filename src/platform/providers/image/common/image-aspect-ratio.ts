/**
 * Map product aspect ratios to provider-native image dimensions.
 */

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function simplifyAspectRatio(width: number, height: number): string {
  const g = gcd(width, height);
  return `${Math.round(width / g)}:${Math.round(height / g)}`;
}

const KNOWN_RATIOS = new Set([
  "1:1",
  "4:5",
  "5:4",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "9:16",
  "16:9",
  "5:8",
  "8:5",
]);

export function extractAspectRatioFromPrompt(prompt: string): string | undefined {
  const text = prompt.trim();
  if (!text) return undefined;

  const labeledRatio = text.match(
    /(?:aspect\s*ratio|ratio)[:\s]*(\d{1,2})\s*[:×x]\s*(\d{1,2})/i
  );
  if (labeledRatio) {
    const w = Number(labeledRatio[1]);
    const h = Number(labeledRatio[2]);
    if (w > 0 && h > 0) return simplifyAspectRatio(w, h);
  }

  for (const match of text.matchAll(/(\d{3,5})\s*[x×]\s*(\d{3,5})\s*(?:px)?/gi)) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w >= 100 && h >= 100 && w <= 10_000 && h <= 10_000) {
      return simplifyAspectRatio(w, h);
    }
  }

  for (const match of text.matchAll(/\b(\d{1,2})\s*[:×x]\s*(\d{1,2})\b/gi)) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w <= 0 || h <= 0 || w > 32 || h > 32) continue;
    const ratio = simplifyAspectRatio(w, h);
    if (KNOWN_RATIOS.has(ratio)) return ratio;
  }

  const lower = text.toLowerCase();
  if (/\b1\s*:\s*1\b/.test(lower) || /\bsquare\b/.test(lower)) return "1:1";
  if (/\b16\s*:\s*9\b/.test(lower) || /\blandscape\b/.test(lower)) return "16:9";
  if (/\b9\s*:\s*16\b/.test(lower)) return "9:16";
  if (/\b4\s*:\s*5\b/.test(lower)) return "4:5";

  return undefined;
}

export function providerAspectRatioBucket(
  aspectRatio: string
): "1:1" | "9:16" | "16:9" {
  const normalized = aspectRatio.trim().toLowerCase();
  if (normalized === "1:1") return "1:1";
  if (normalized === "16:9" || normalized === "8:5") return "16:9";
  if (normalized === "9:16") return "9:16";

  const parts = normalized.split(":").map(Number);
  if (parts.length === 2 && parts[0]! > 0 && parts[1]! > 0) {
    const ratio = parts[0]! / parts[1]!;
    if (Math.abs(ratio - 1) < 0.08) return "1:1";
    return ratio > 1 ? "16:9" : "9:16";
  }

  return "1:1";
}

/** OpenAI gpt-image-* supported sizes. */
export function openAiImageSizeForAspectRatio(
  aspectRatio?: string
): string | undefined {
  if (!aspectRatio) return undefined;
  switch (providerAspectRatioBucket(aspectRatio)) {
    case "16:9":
      return "1536x1024";
    case "9:16":
      return "1024x1536";
    case "1:1":
      return "1024x1024";
    default:
      return undefined;
  }
}

export function readAspectRatioFromPayload(
  payload: Readonly<Record<string, unknown>>
): string | undefined {
  const direct =
    typeof payload.aspectRatio === "string"
      ? payload.aspectRatio.trim()
      : typeof payload.aspect_ratio === "string"
        ? payload.aspect_ratio.trim()
        : undefined;
  return direct || undefined;
}

export function bflAspectRatioForProduct(aspectRatio?: string): string {
  if (!aspectRatio) return "1:1";
  return providerAspectRatioBucket(aspectRatio);
}

export function promptTextFromPayload(
  payload: Readonly<Record<string, unknown>>
): string {
  return (
    (typeof payload.prompt === "string" && payload.prompt) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.input === "string" && payload.input) ||
    ""
  );
}

export function resolvePayloadAspectRatio(
  payload: Readonly<Record<string, unknown>>
): string | undefined {
  const direct = readAspectRatioFromPayload(payload);
  if (direct) return direct;
  return extractAspectRatioFromPrompt(promptTextFromPayload(payload));
}
