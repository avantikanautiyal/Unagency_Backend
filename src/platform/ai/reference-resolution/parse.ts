/**
 * Deterministic parse helpers for generation reference resolution.
 * Reuses the same ordinal/version patterns as CTI reference-resolution.
 */

export function parseExplicitSlideNumber(text: string): number | undefined {
  const m = text.match(
    /\bslide\s*(?:#|number\s*)?(\d+)\b|\bon\s+slide\s+(\d+)\b|\bslide\s+(\d+)\s+of\s+the\s+deck\b/i,
  );
  if (!m) return undefined;
  const n = Number.parseInt(m[1] || m[2] || m[3] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseOrdinalSlide(text: string):
  | { kind: "first" | "last" | "nth"; index?: number; sourceText: string }
  | undefined {
  const first = text.match(/\b(first|1st)\s+slide\b/i);
  if (first) return { kind: "first", index: 1, sourceText: first[0]! };
  const last = text.match(/\b(last|final)\s+slide\b/i);
  if (last) return { kind: "last", sourceText: last[0]! };
  const nth = text.match(
    /\b(second|third|fourth|2nd|3rd|4th)\s+slide\b/i,
  );
  if (nth) {
    const map: Record<string, number> = {
      second: 2,
      "2nd": 2,
      third: 3,
      "3rd": 3,
      fourth: 4,
      "4th": 4,
    };
    const index = map[nth[1]!.toLowerCase()];
    if (index) return { kind: "nth", index, sourceText: nth[0]! };
  }
  return undefined;
}

/**
 * Parse "option 2" / "the second option" style references (1-based).
 * Deterministic only — does not invent which artifact owns the option.
 */
export function parseOptionReference(
  text: string,
): { index: number; sourceText: string; kind: "explicit" | "ordinal" } | undefined {
  const ordinal = text.match(
    /\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+option\b/i,
  );
  if (ordinal) {
    const map: Record<string, number> = {
      first: 1,
      "1st": 1,
      second: 2,
      "2nd": 2,
      third: 3,
      "3rd": 3,
      fourth: 4,
      "4th": 4,
    };
    const index = map[ordinal[1]!.toLowerCase()];
    if (index) {
      return { index, sourceText: ordinal[0]!, kind: "ordinal" };
    }
  }
  const numbered = text.match(/\boption\s*#?\s*(\d+)\b/i);
  if (numbered?.[1]) {
    const index = Number.parseInt(numbered[1], 10);
    if (Number.isFinite(index) && index > 0) {
      return { index, sourceText: numbered[0]!, kind: "explicit" };
    }
  }
  return undefined;
}

export function parseExplicitVersionNumber(text: string): number | undefined {
  const vMatch = text.match(/\bversion\s*#?\s*(\d+)\b/i);
  if (vMatch?.[1]) {
    const n = Number.parseInt(vMatch[1], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const short = text.match(/\bv(\d+)\b/i);
  if (short?.[1]) {
    const n = Number.parseInt(short[1], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

export type DetectedReferenceSpan = {
  readonly sourceText: string;
  readonly kind:
    | "previous_output"
    | "approved_output"
    | "selected_output"
    | "same_design"
    | "approved_design"
    | "approved_storyline"
    | "approved_slide_content"
    | "deictic_that"
    | "explicit_slide"
    | "ordinal_slide"
    | "explicit_option"
    | "ordinal_option"
    | "explicit_version";
};

/** Detect reference phrases present in instruction (order = detection order). */
export function detectReferenceSpans(text: string): DetectedReferenceSpan[] {
  const spans: DetectedReferenceSpan[] = [];
  const push = (kind: DetectedReferenceSpan["kind"], sourceText: string) => {
    if (!spans.some((s) => s.sourceText === sourceText && s.kind === kind)) {
      spans.push({ kind, sourceText });
    }
  };

  const slideN = parseExplicitSlideNumber(text);
  if (slideN != null) {
    const m = text.match(
      /\bslide\s*(?:#|number\s*)?\d+\b|\bon\s+slide\s+\d+\b/i,
    );
    push("explicit_slide", m?.[0] ?? `slide ${slideN}`);
  }

  const ordinal = parseOrdinalSlide(text);
  if (ordinal) push("ordinal_slide", ordinal.sourceText);

  const option = parseOptionReference(text);
  if (option) {
    push(
      option.kind === "ordinal" ? "ordinal_option" : "explicit_option",
      option.sourceText,
    );
  }

  const ver = parseExplicitVersionNumber(text);
  if (ver != null) {
    const m = text.match(/\bversion\s*#?\s*\d+\b|\bv\d+\b/i);
    push("explicit_version", m?.[0] ?? `version ${ver}`);
  }

  const prev =
    text.match(
      /\b(previous output|previous version|last output|just generated|the one we just generated|modify the one we just generated)\b/i,
    ) ?? text.match(/\b(use the previous|keep the previous)\b/i);
  if (prev) push("previous_output", prev[0]!);

  if (/\bapproved\s+storyline\b/i.test(text)) {
    const m = text.match(/\bapproved\s+storyline\b/i)!;
    push("approved_storyline", m[0]!);
  }
  if (/\bapproved\s+slide[- ]?content\b/i.test(text)) {
    const m = text.match(/\bapproved\s+slide[- ]?content\b/i)!;
    push("approved_slide_content", m[0]!);
  }
  if (
    /\b(approved\s+design(?:\s+system)?|the approved design)\b/i.test(text)
  ) {
    const m = text.match(
      /\b(approved\s+design(?:\s+system)?|the approved design)\b/i,
    )!;
    push("approved_design", m[0]!);
  }
  if (
    /\b(same design|same style|selected design|use the selected design|keep the selected design)\b/i.test(
      text,
    )
  ) {
    const m = text.match(
      /\b(same design|same style|selected design|use the selected design|keep the selected design)\b/i,
    )!;
    push("same_design", m[0]!);
  }
  if (
    /\b(approved (?:version|output|artifact)|use the approved version)\b/i.test(
      text,
    ) &&
    !spans.some((s) => s.kind.startsWith("approved_"))
  ) {
    const m = text.match(
      /\b(approved (?:version|output|artifact)|use the approved version)\b/i,
    )!;
    push("approved_output", m[0]!);
  }
  if (
    /\b(selected (?:version|output|artifact)|use the selected)\b/i.test(text) &&
    !spans.some((s) => s.kind === "same_design")
  ) {
    const m = text.match(
      /\b(selected (?:version|output|artifact)|use the selected)\b/i,
    )!;
    push("selected_output", m[0]!);
  }

  // Deictic "that" / "this" — only when not already covered by richer spans.
  if (
    /\b(make|change|update|modify|improve)\s+that\b/i.test(text) ||
    /\bthat\b/i.test(text) &&
      /\b(more premium|better|premium)\b/i.test(text)
  ) {
    const m =
      text.match(/\bthat\b/i) ??
      text.match(/\b(make|change|update|modify)\s+that\b/i);
    if (m) push("deictic_that", m[0]!.includes(" ") ? "that" : m[0]!);
  }

  return spans;
}

export function isDesignKey(artifactKey?: string): boolean {
  if (!artifactKey) return false;
  return (
    artifactKey.includes("design-system") || artifactKey.includes("design-route")
  );
}

export function isSlideContentKey(artifactKey?: string): boolean {
  return Boolean(artifactKey?.includes("slide-content"));
}

export function isStorylineKey(artifactKey?: string): boolean {
  return Boolean(artifactKey?.includes("storyline"));
}

/**
 * Artifact keys that commonly hold selectable multi-choice payloads
 * (routes / options / directions / concepts). Generic — not service-specific.
 */
export function isSelectableChoiceArtifactKey(artifactKey?: string): boolean {
  if (!artifactKey) return false;
  const k = artifactKey.toLowerCase();
  return (
    k.includes("storyline") ||
    k.includes("routes") ||
    k.endsWith(".route") ||
    k.includes("direction") ||
    k.includes("concept") ||
    k.includes("option") ||
    k.includes("choice") ||
    k.includes("variant") ||
    k.includes("candidate")
  );
}
