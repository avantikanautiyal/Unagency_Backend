/**
 * Deterministic refinement instruction parser (M6).
 * Produces structured intent — never a full DeckSpec rewrite.
 * AI may later propose intent; application remains patch-based.
 */

import type { CdfPatchOp, CdfRefinementScope } from "./types";

export type ParsedRefinementIntent = {
  op?: CdfPatchOp;
  scope: CdfRefinementScope;
  slideNumber?: number;
  elementHint?:
    | "title"
    | "headline"
    | "subtitle"
    | "image"
    | "logo"
    | "shape"
    | "text";
  value?: unknown;
  textValue?: string;
  ambiguous: boolean;
  ambiguityReason?: string;
  unsupported?: boolean;
  unsupportedReason?: string;
};

const SLIDE_RE =
  /\bslide\s*(?:#|number\s*)?(\d+)\b|\bon\s+slide\s+(\d+)\b/i;

export function parseRefinementInstruction(
  raw: string,
): ParsedRefinementIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();

  const slideMatch = text.match(SLIDE_RE);
  const slideNumber = slideMatch
    ? Number(slideMatch[1] || slideMatch[2])
    : undefined;

  // Exact text replacement: change/set headline/title ... to '...'
  const setText =
    text.match(
      /(?:change|set|replace)\s+(?:the\s+)?(?:headline|title|text)(?:\s+on\s+slide\s+\d+)?\s+to\s+['"](.+?)['"]\s*[.!]?\s*$/i,
    ) ||
    text.match(
      /(?:change|set|replace)\s+(?:the\s+)?(?:headline|title|text)\s+to\s+['"](.+?)['"]/i,
    );
  if (setText) {
    return {
      op: "SET_TEXT",
      scope: "property",
      slideNumber,
      elementHint: /headline/i.test(text) ? "headline" : "title",
      textValue: setText[1],
      value: setText[1],
      ambiguous: slideNumber == null,
      ambiguityReason:
        slideNumber == null ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // Font size: make ... larger / bigger / smaller / Npx / N pt
  const px = text.match(/\b(\d+)\s*(?:px|pt)\b/i);
  if (
    /(?:title|headline|text|font)/i.test(text) &&
    (/(larger|bigger|increase|smaller|decrease)/i.test(text) || px)
  ) {
    let value: number | "larger" | "smaller" = "larger";
    if (px) value = Number(px[1]);
    else if (/smaller|decrease/i.test(text)) value = "smaller";
    return {
      op: "SET_FONT_SIZE",
      scope: "property",
      slideNumber,
      elementHint: /headline/i.test(text)
        ? "headline"
        : /subtitle/i.test(text)
          ? "subtitle"
          : "title",
      value,
      ambiguous: slideNumber == null,
      ambiguityReason:
        slideNumber == null ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // Move / position
  const move = text.match(
    /move\s+(?:the\s+)?(logo|image|title|shape)?(?:\s+on\s+slide\s+\d+)?\s+(?:slightly\s+)?(to the right|to the left|up|down)/i,
  );
  if (move || /\bmove\b/i.test(text)) {
    const dir = move?.[2]?.toLowerCase() ?? "";
    const delta =
      dir.includes("right")
        ? { dx: 0.02, dy: 0 }
        : dir.includes("left")
          ? { dx: -0.02, dy: 0 }
          : dir.includes("up")
            ? { dx: 0, dy: -0.02 }
            : dir.includes("down")
              ? { dx: 0, dy: 0.02 }
              : undefined;
    const hintRaw = (move?.[1] || "").toLowerCase();
    const elementHint =
      hintRaw === "logo"
        ? "logo"
        : hintRaw === "image"
          ? "image"
          : hintRaw === "title"
            ? "title"
            : hintRaw === "shape"
              ? "shape"
              : "image";
    return {
      op: "SET_POSITION",
      scope: "property",
      slideNumber,
      elementHint,
      value: delta,
      ambiguous: slideNumber == null || !delta,
      ambiguityReason:
        slideNumber == null || !delta ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // Size / spacing
  if (/increase\s+(?:the\s+)?spacing/i.test(text)) {
    return {
      op: "SET_POSITION",
      scope: "property",
      slideNumber,
      elementHint: "subtitle",
      value: { dx: 0, dy: 0.03 },
      ambiguous: slideNumber == null,
      ambiguityReason:
        slideNumber == null ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  if (/\b(resize|make\s+(?:it\s+)?(?:wider|taller|smaller|larger\s+box))\b/i.test(text)) {
    return {
      op: "SET_SIZE",
      scope: "property",
      slideNumber,
      elementHint: "title",
      value: { dw: 0.02, dh: 0.02 },
      ambiguous: slideNumber == null,
      ambiguityReason:
        slideNumber == null ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // Color
  const color = text.match(
    /(?:use|change|set|make).*(?:color|titles?|headings?).*?\b(green|blue|red|#[0-9a-f]{3,8}|brand blue)\b/i,
  );
  if (color || /brand blue/i.test(text)) {
    const rawColor = color?.[1] ?? "brand blue";
    const value =
      /brand blue|blue/i.test(rawColor) && !/^#/.test(rawColor)
        ? { kind: "token", value: "color.primary" }
        : /green/i.test(rawColor)
          ? "#2ECC71"
          : /red/i.test(rawColor)
            ? "#E74C3C"
            : rawColor;
    return {
      op: "SET_TEXT_COLOR",
      scope: /all section headings|all titles/i.test(text)
        ? "artifact"
        : "property",
      slideNumber,
      elementHint: "title",
      value,
      ambiguous:
        slideNumber == null &&
        !/all section headings|all titles/i.test(text),
      ambiguityReason:
        slideNumber == null &&
        !/all section headings|all titles/i.test(text)
          ? "AMBIGUOUS_TARGET"
          : undefined,
    };
  }

  // Replace image / logo
  const asset = text.match(
    /replace\s+(?:the\s+)?(image|logo)(?:\s+on\s+slide\s+\d+)?(?:\s+with\s+(?:asset\s+)?([a-f0-9]{24}))?/i,
  );
  if (asset || /replace\s+(?:the\s+)?(?:image|logo)/i.test(text)) {
    const vaultId = asset?.[2];
    return {
      op: "REPLACE_ASSET",
      scope: "element",
      slideNumber,
      elementHint: /logo/i.test(text) ? "logo" : "image",
      value: vaultId,
      ambiguous: slideNumber == null || !vaultId,
      ambiguityReason:
        slideNumber == null || !vaultId ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // Visibility
  if (/hide|show|make\s+(?:it\s+)?(?:invisible|visible)/i.test(text)) {
    return {
      op: "SET_VISIBILITY",
      scope: "element",
      slideNumber,
      elementHint: "title",
      value: !/hide|invisible/i.test(text),
      ambiguous: slideNumber == null,
      ambiguityReason:
        slideNumber == null ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // Known unsupported subjective ops
  if (/make\s+(?:it\s+)?cleaner|prettier|more premium|redesign/i.test(lower)) {
    return {
      scope: "slide",
      slideNumber,
      ambiguous: true,
      ambiguityReason: "UNSUPPORTED_SEMANTIC",
      unsupported: true,
      unsupportedReason:
        "Subjective refinement requires clarification or is unsupported as a deterministic patch",
    };
  }

  // Generic "make the title bigger" without slide → ambiguous
  if (/title|headline|image|logo/i.test(text)) {
    return {
      scope: "property",
      slideNumber,
      elementHint: /image|logo/i.test(text) ? "image" : "title",
      ambiguous: true,
      ambiguityReason: "AMBIGUOUS_TARGET",
    };
  }

  return {
    scope: "artifact",
    ambiguous: true,
    ambiguityReason: "AMBIGUOUS_TARGET",
    unsupported: true,
    unsupportedReason: "Could not map instruction to a supported patch operation",
  };
}
