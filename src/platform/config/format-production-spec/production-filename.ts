/**
 * Spec filename convention:
 * UNAGENCY_Service_Placement_Size_Language_Variant_v##_YYYYMMDD.ext
 */

export type BuildProductionExportFilenameInput = {
  readonly service?: string;
  readonly placement?: string;
  /** e.g. 1080x1350 or A4 */
  readonly size?: string;
  readonly language?: string;
  readonly variant?: string;
  /** Version number (defaults to 1). */
  readonly version?: number;
  /** ISO date or Date; defaults to today UTC. */
  readonly date?: string | Date;
  /** Extension without dot (png, jpg, mp4, …). */
  readonly extension: string;
};

function sanitizeSegment(raw: string | undefined, fallback: string): string {
  const s = (raw ?? "").trim();
  if (!s) return fallback;
  return s
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 64) || fallback;
}

function yyyymmdd(date: string | Date | undefined): string {
  const d =
    date instanceof Date
      ? date
      : typeof date === "string" && date.trim()
        ? new Date(date)
        : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Build a Spec-compliant export filename (basename + extension).
 */
export function buildProductionExportFilename(
  input: BuildProductionExportFilenameInput,
): string {
  const service = sanitizeSegment(input.service, "Service");
  const placement = sanitizeSegment(input.placement, "Placement");
  const size = sanitizeSegment(input.size, "Size");
  const language = sanitizeSegment(input.language, "EN");
  const variant = sanitizeSegment(input.variant, "A");
  const versionNum =
    typeof input.version === "number" &&
    Number.isFinite(input.version) &&
    input.version > 0
      ? Math.floor(input.version)
      : 1;
  const version = `v${String(versionNum).padStart(2, "0")}`;
  const date = yyyymmdd(input.date);
  const ext = sanitizeSegment(input.extension.replace(/^\./, ""), "bin").toLowerCase();

  return `UNAGENCY_${service}_${placement}_${size}_${language}_${variant}_${version}_${date}.${ext}`;
}

/**
 * Derive size token from pixel canvas or freeform label.
 */
export function sizeTokenFromCanvas(
  width?: number,
  height?: number,
  unit: "px" | "mm" | "in" = "px",
): string | undefined {
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  ) {
    if (unit === "px") return `${Math.round(width)}x${Math.round(height)}`;
    return `${width}x${height}${unit}`;
  }
  return undefined;
}
