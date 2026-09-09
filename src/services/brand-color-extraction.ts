/**
 * Brand colour helpers.
 * Mechanical: hex extraction / merge / normalize.
 * Alias tables remain for heuristic fallback when LLM extract is unavailable —
 * production semantic understanding is LLM-primary (`brand-brief-llm-extractor`).
 */

/** Canonical English token → multilingual surface forms (Latin + Devanagari where common). */
export const MULTILINGUAL_COLOR_ALIASES: Readonly<Record<string, readonly string[]>> = {
  red: [
    "red",
    "laal",
    "lal",
    "laalaa",
    "rojo",
    "roja",
    "rouge",
    "crimson",
    "scarlet",
    "maroon",
    "लाल",
    "लाला",
  ],
  blue: ["blue", "neela", "neel", "nila", "azul", "bleu", "navy", "नीला", "नील"],
  green: ["green", "hara", "haraa", "verde", "vert", "mint", "olive", "emerald", "हरा", "हरी"],
  yellow: ["yellow", "peela", "pila", "peelaa", "amarillo", "jaune", "पीला"],
  saffron: ["saffron", "kesari", "केसरी"],
  orange: ["orange", "narangi", "naranja", "corail"],
  purple: ["purple", "violet", "baingani", "morado", "violeta", "lavender", "indigo"],
  pink: ["pink", "gulabi", "rosa", "rose", "peach", "coral", "गुलाबी"],
  black: ["black", "kala", "kaala", "negro", "noir", "charcoal", "काला", "काली"],
  white: ["white", "safed", "safed", "blanco", "blanc", "ivory", "cream", "सफेद"],
  grey: ["grey", "gray", "gris", "slate"],
  brown: ["brown", "bhura", "bhoora", "marron", "beige", "terracotta", "rust", "भूरा"],
  gold: ["gold", "golden", "dorado", "dorada", "gilded", "metallic gold", "sona", "सुनहरा", "सोना"],
  silver: ["silver", "chrome", "chrome silver", "plateado", "plateada", "metallic silver", "chandi", "चांदी"],
  teal: ["teal", "turquoise", "cyan", "aqua"],
  navy: ["navy", "midnight blue", "dark blue"],
  terracotta: ["terracotta", "earthen", "earth tone"],
  ochre: ["ochre", "oker"],
};

const ENGLISH_COLOR_NAMES = [
  "red", "blue", "green", "yellow", "orange", "purple", "violet", "pink",
  "black", "white", "grey", "gray", "brown", "beige", "cream", "ivory",
  "gold", "silver", "teal", "navy", "coral", "peach", "mint", "olive",
  "charcoal", "maroon", "turquoise", "lavender", "terracotta", "saffron",
  "ochre", "rust", "indigo",
];

/** Multilingual cues that the user is talking about colour / palette. */
const COLOR_CONTEXT_RE =
  /\b(?:brand\s+)?(?:colou?rs?|palette|scheme|theme|colourway|colorway)\b|\b(?:rang(?:o?n|in)?|rango?)\b|\bcolores?\b|\bpaleta\b|\besquema\s+de\s+colores\b|\bcouleurs?\b|\bpalette\s+de\s+couleurs\b/i;

/** Brief lists colours inline (any language) — satisfies continuity without Brand Memory. */
export function briefSpecifiesColorPalette(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  if (/#([0-9a-fA-F]{3,6})\b/.test(t)) return true;
  if (extractBriefColors(t).length > 0) return true;

  return (
    /\b(colou?rs?|palette|colour\s*theme|rang(?:o?n)?|colores?|paleta)\s*[:\-–=]\s*\S+/i.test(t) ||
    /\b(colou?r|color)\s+theme\s+(should\s+be|is|of)\b/i.test(t) ||
    /\b(metallic|warm|earthy|pastel|muted|vibrant|bold)\s+(?:colou?rs?|tones?|palette)\b/i.test(t)
  );
}

function aliasToCanonical(token: string): string | undefined {
  const lower = token.trim().toLowerCase();
  if (!lower) return undefined;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(lower)) return lower;
  if (Object.prototype.hasOwnProperty.call(MULTILINGUAL_COLOR_ALIASES, lower)) {
    return lower;
  }
  for (const [canonical, aliases] of Object.entries(MULTILINGUAL_COLOR_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === lower)) return canonical;
  }
  if (ENGLISH_COLOR_NAMES.includes(lower)) return lower;
  return undefined;
}

/** True when a token is a known colour name (not a brand subject by default). */
export function isKnownColorSurfaceForm(token: string): boolean {
  return aliasToCanonical(token) !== undefined;
}

function scanTextForColorTokens(scan: string): string[] {
  const found: string[] = [];
  const lower = scan.toLowerCase();

  for (const [canonical, aliases] of Object.entries(MULTILINGUAL_COLOR_ALIASES)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?:^|[\\s,;/|&+\\-–—()]|\\d)${escaped}(?:$|[\\s,;/|&+\\-–—().])`, "iu").test(scan)) {
        found.push(canonical);
        break;
      }
    }
  }

  for (const color of ENGLISH_COLOR_NAMES) {
    if (new RegExp(`\\b${color}\\b`, "i").test(lower)) found.push(color);
  }

  return found;
}

/**
 * Extract hex colour codes only — mechanical, language-agnostic.
 */
export function extractHexColors(text: string | null | undefined): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const m of raw.matchAll(/#([0-9a-fA-F]{3,6})\b/g)) {
    const hex = `#${m[1]!.toLowerCase()}`;
    if (seen.has(hex)) continue;
    seen.add(hex);
    found.push(hex);
  }
  return found.slice(0, 10);
}

/**
 * Extract colour tokens from free text (hex + multilingual name aliases).
 * Heuristic fallback when LLM extract is unavailable — prefer LLM for semantics.
 * Returns canonical English names and hex codes for downstream prompts.
 */
export function extractBriefColors(text: string | null | undefined): string[] {
  const raw = (text ?? "").trim();
  if (!raw) return [];

  const found: string[] = [...extractHexColors(raw)];

  const listMatch = raw.match(
    /(?:brand\s+)?(?:colou?rs?|palette|scheme|theme|rang(?:o?n)?|colores?|paleta)\s*[:\-–,=]*\s*(?:being|are|is|hon|son|es|être)?\s*([^.!?\n]{2,160})/iu
  );
  const segment = listMatch?.[1]?.trim() ? listMatch[1]! : raw;
  const segmentTokens = scanTextForColorTokens(segment);
  found.push(...segmentTokens);

  // Palette/list captures text *after* the keyword — e.g. "bold red palette for ads"
  // yields segment "for ads" and drops "red". Rescan the full brief when needed.
  if (segmentTokens.length === 0 && segment !== raw) {
    found.push(...scanTextForColorTokens(raw));
  } else if (!listMatch && COLOR_CONTEXT_RE.test(raw)) {
    found.push(...scanTextForColorTokens(raw));
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const token of found) {
    const canon = aliasToCanonical(token) ?? token.toLowerCase();
    const key = canon.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(canon.startsWith("#") ? canon : canon.toLowerCase());
  }

  return normalized.slice(0, 10);
}

/** True when the brief likely mentions colours but regex found none — LLM fallback candidate. */
export function briefLikelyMentionsColors(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (COLOR_CONTEXT_RE.test(t)) return true;
  if (/#([0-9a-fA-F]{3,6})\b/.test(t)) return true;
  for (const aliases of Object.values(MULTILINGUAL_COLOR_ALIASES)) {
    for (const alias of aliases) {
      if (alias.length < 3) continue;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(escaped, "iu").test(t)) return true;
    }
  }
  return false;
}

export function mergeColorLists(
  ...lists: readonly (readonly string[] | undefined)[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const c of list ?? []) {
      const t = String(c).trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t.startsWith("#") ? t.toLowerCase() : t);
    }
  }
  return out.slice(0, 10);
}

/** Resolve colours from brief text + execution metadata + optional stored profile colours. */
export function resolveBriefBrandColors(input: {
  readonly brief?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly storedColors?: readonly string[] | null;
}): string[] {
  const metaColors = Array.isArray(input.metadata?.brandColors)
    ? input.metadata!.brandColors.map(String).filter(Boolean)
    : typeof input.metadata?.brandColors === "string" && input.metadata.brandColors.trim()
      ? [input.metadata.brandColors.trim()]
      : [];
  const learned = Array.isArray(input.metadata?.learnedBrandColors)
    ? input.metadata!.learnedBrandColors.map(String).filter(Boolean)
    : [];
  const briefExtracted = Array.isArray(input.metadata?.briefExtractedColors)
    ? input.metadata!.briefExtractedColors.map(String).filter(Boolean)
    : [];

  return mergeColorLists(
    input.storedColors ?? undefined,
    metaColors,
    learned,
    briefExtracted,
    extractBriefColors(input.brief),
  );
}
