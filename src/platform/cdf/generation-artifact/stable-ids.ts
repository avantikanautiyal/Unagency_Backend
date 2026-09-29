/**
 * Deterministic stable IDs for presentation normalization (M3C).
 * Prefer content-derived / order-derived ids over random UUIDs.
 */

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function slugifyId(raw: string, fallback: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return s || fallback;
}

export function stableSlideId(order: number, existing?: string): string {
  if (existing && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(existing)) {
    return existing;
  }
  return `slide_${pad2(order + 1)}`;
}

export function stableBlockId(
  slideOrder: number,
  blockOrder: number,
  type: string,
  existing?: string,
): string {
  if (existing && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(existing)) {
    return existing;
  }
  return `block_${slugifyId(type, "block")}_${pad2(slideOrder + 1)}_${pad2(blockOrder + 1)}`;
}

export function stableElementId(
  slideOrder: number,
  role: string,
  existing?: string,
): string {
  if (existing && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(existing)) {
    return existing;
  }
  return `element_${slugifyId(role, "el")}_${pad2(slideOrder + 1)}`;
}

export function stableSectionId(order: number, title: string, existing?: string): string {
  if (existing && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(existing)) {
    return existing;
  }
  return `section_${pad2(order + 1)}_${slugifyId(title, "section")}`;
}

export function stableRouteId(name: string, index: number, existing?: string): string {
  if (existing && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(existing)) {
    return existing;
  }
  return `route_${pad2(index + 1)}_${slugifyId(name, "route")}`;
}

export function createCandidateId(executionId?: string, artifactKey?: string): string {
  const exec = executionId?.replace(/[^a-zA-Z0-9_-]/g, "") || "noexec";
  const key = (artifactKey || "artifact").replace(/\./g, "-");
  return `cand_${exec}_${key}`;
}
