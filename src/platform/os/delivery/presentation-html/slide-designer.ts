/**
 * Model-designed presentation slides.
 *
 * Instead of filling a fixed template, Claude designs every slide as a
 * self-contained HTML/CSS composition on a 1920×1080 canvas, sharing one
 * deck-level theme so the deck stays consistent. The renderer then paints
 * the HTML in headless Chrome (PDF, PNG previews, image-based PPTX).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PresentationPlan } from "../document-export-service";

export const SLIDE_WIDTH_PX = 1920;
export const SLIDE_HEIGHT_PX = 1080;

/** Fonts the designer may use (loaded from Google Fonts at render time). */
export const DESIGN_FONT_FAMILIES = [
  "Inter",
  "Manrope",
  "DM Sans",
  "Space Grotesk",
  "Plus Jakarta Sans",
  "Sora",
  "Outfit",
  "Archivo",
  "Playfair Display",
  "DM Serif Display",
  "Fraunces",
  "Cormorant Garamond",
  "Libre Baskerville",
  "Bebas Neue",
  "Syne",
  "JetBrains Mono",
] as const;

export type DesignedDeck = {
  /** Deck-level CSS (variables, type scale, shared components). */
  readonly themeCss: string;
  /** Google Fonts families the theme uses (subset of DESIGN_FONT_FAMILIES). */
  readonly fonts: readonly string[];
  /** One `<section class="slide">…</section>` per rendered slide, in order. */
  readonly slides: readonly string[];
};

export type SlideDesignBrief = {
  readonly plan: PresentationPlan;
  readonly brandName?: string;
  readonly brandColors?: readonly string[];
  readonly brandTone?: string;
  readonly brandTypography?: string;
  readonly designDirection?: string;
  readonly userBrief?: string;
  readonly hasLogo: boolean;
  /** 0-based plan slide indices that get a generated photo ({{IMAGE_n}}). */
  readonly imageSlots: readonly number[];
};

export type SlideRepairRequest = {
  readonly deck: DesignedDeck;
  /** 0-based slide index → defects found by the renderer's QA. */
  readonly defects: ReadonlyMap<number, readonly string[]>;
};

export type SlideDesignerConfig = {
  readonly model: string;
  readonly effort: "low" | "medium" | "high" | "xhigh" | "max";
  readonly timeoutMs: number;
};

export function slideDesignerConfigFromEnv(env = process.env): SlideDesignerConfig {
  const effort = (env.PRESENTATION_DESIGN_EFFORT ?? "").trim();
  const timeout = Number(env.PRESENTATION_DESIGN_TIMEOUT_MS);
  return {
    model: env.PRESENTATION_DESIGN_MODEL?.trim() || "claude-opus-5-5",
    effort:
      effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max"
        ? effort
        : "high",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 8 * 60_000,
  };
}

const SYSTEM_PROMPT = `You are the senior presentation designer at a top creative agency. You design pitch and strategy decks that look hand-made by a designer — never like a template.

You write each slide as HTML + CSS that is rendered in headless Chrome on a fixed ${SLIDE_WIDTH_PX}×${SLIDE_HEIGHT_PX}px canvas, then exported to PDF and PPTX.

Design standards:
- Every slide gets its own composition chosen for its content: asymmetric grids, oversized numerals, split layouts, full-bleed imagery with overlaid type, stat callouts, comparison columns, timelines, process flows, quote slides, agenda lists, matrices. Avoid repeating the same layout on consecutive slides.
- Show structure visually. When content holds numbers, steps, phases, comparisons or relationships, express it as a chart, diagram, timeline or stat block drawn with inline SVG or CSS — not as bullets. Use bullets only when the content is a genuine list, and never more than 5 per slide.
- Strong typographic hierarchy: one dominant element per slide, generous whitespace, tight headline leading, considered letter-spacing for eyebrows/labels.
- One deck-level system: the theme defines colours, type scale, spacing and recurring devices (rules, page numbers, section markers, logo placement) that every slide reuses.
- Use the brand colours as given; derive tints/shades from them for backgrounds and data. Ensure WCAG AA contrast for all text.

Hard rules (the renderer checks these and rejects slides that break them):
- Each slide is exactly one <section class="slide"> … </section>. The theme already sizes .slide to ${SLIDE_WIDTH_PX}×${SLIDE_HEIGHT_PX}px with position:relative and overflow:hidden; do not change that.
- Nothing may overflow the slide or its own box. Size text so it fits with room to spare. Minimum font size 22px; body copy 28px or larger; headlines 56px or larger.
- No <script>, no external URLs, no <iframe>, no web fonts other than the allowed families. Use only these image sources: {{LOGO}} for the brand logo (only if a logo is available) and {{IMAGE_n}} (n = slide number) for the slides that have a generated photo. Use those images with object-fit: cover inside a sized box.
- The PPTX is editable, so every word must be real HTML text (h1–h6, p, li, span, div): never SVG <text>, CSS content strings or text inside images. Draw chart and diagram shapes in SVG/CSS, but put their labels and numbers in HTML elements positioned over or beside them. Keep text horizontal (no rotate/skew/scale on text) and do not use gradient-filled or outlined text.
- Use only the content provided. You may shorten, restructure and re-group the copy and turn it into visual elements, but never invent statistics, numbers, client names, quotes or claims.
- Do not render speaker notes on the slide.

Output format — exactly this, with no other text and no markdown fences:
<<<FONTS>>>
Family One, Family Two
<<<THEME>>>
(CSS for the whole deck)
<<<SLIDE 1>>>
<section class="slide">…</section>
<<<SLIDE 2>>>
<section class="slide">…</section>
…`;

function contentForPrompt(brief: SlideDesignBrief): string {
  const { plan } = brief;
  const lines: string[] = [];
  lines.push(`DECK TITLE: ${plan.title}`);
  if (plan.subtitle) lines.push(`SUBTITLE: ${plan.subtitle}`);
  lines.push(`TOTAL SLIDES: ${plan.slides.length + 1} (slide 1 is the cover built from the title/subtitle; content slides follow in order)`);
  lines.push("");
  lines.push("SLIDE 1 — cover");
  lines.push(`  title: ${plan.title}`);
  if (plan.subtitle) lines.push(`  subtitle: ${plan.subtitle}`);
  if (brief.imageSlots.includes(-1)) lines.push("  photo: {{IMAGE_1}}");
  plan.slides.forEach((slide, i) => {
    const n = i + 2;
    lines.push("");
    lines.push(`SLIDE ${n} — suggested role: ${slide.layout ?? "content"}`);
    lines.push(`  title: ${slide.title}`);
    for (const b of slide.bullets) lines.push(`  - ${b}`);
    if (brief.imageSlots.includes(i)) {
      lines.push(`  photo: {{IMAGE_${n}}} (subject: ${slide.visualCue ?? "brand imagery"})`);
    }
  });
  return lines.join("\n");
}

function briefForPrompt(brief: SlideDesignBrief): string {
  const parts = [
    `BRAND: ${brief.brandName ?? "(unnamed)"}`,
    `BRAND COLOURS: ${brief.brandColors?.length ? brief.brandColors.join(", ") : "none given — choose a refined palette that suits the brief"}`,
    brief.brandTypography ? `BRAND TYPOGRAPHY NOTES: ${brief.brandTypography}` : "",
    brief.brandTone ? `BRAND TONE: ${brief.brandTone}` : "",
    brief.designDirection ? `CHOSEN DESIGN DIRECTION: ${brief.designDirection}` : "",
    `LOGO: ${brief.hasLogo ? "available as {{LOGO}} — place it on the cover and closing slide, and small in a consistent corner on content slides" : "none — set the brand name as a wordmark instead"}`,
    `ALLOWED FONT FAMILIES: ${DESIGN_FONT_FAMILIES.join(", ")} (pick at most 2 that match the brand)`,
    brief.userBrief ? `CLIENT BRIEF (context only, do not add claims from it):\n${brief.userBrief.slice(0, 2500)}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  cachedClient ??= new Anthropic();
  return cachedClient;
}

export function slideDesignerAvailable(env = process.env): boolean {
  if ((env.PRESENTATION_RENDERER ?? "").trim().toLowerCase() === "template") return false;
  if ((env.ANTHROPIC_ENABLED ?? "true").trim().toLowerCase() === "false") return false;
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
}

async function callDesigner(
  messages: Anthropic.Beta.BetaMessageParam[],
  config: SlideDesignerConfig,
  signal?: AbortSignal,
): Promise<string> {
  const stream = client().beta.messages.stream(
    {
      model: config.model,
      max_tokens: 64_000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: config.effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    },
    { timeout: config.timeoutMs, ...(signal ? { signal } : {}) },
  );
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("Slide designer declined the request");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Slide designer ran out of output tokens");
  }
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

/** Parse the marker-delimited response into theme + slides. */
export function parseDesignedDeck(raw: string, expectedSlides: number): DesignedDeck {
  const text = raw.replace(/^```[a-z]*\n?|```\s*$/gim, "");
  const fontsMatch = text.match(/<<<FONTS>>>\s*([\s\S]*?)<<<THEME>>>/);
  const themeMatch = text.match(/<<<THEME>>>\s*([\s\S]*?)<<<SLIDE 1>>>/);
  if (!themeMatch) throw new Error("Slide designer response has no theme block");
  const slides: string[] = [];
  const re = /<<<SLIDE (\d+)>>>\s*([\s\S]*?)(?=<<<SLIDE \d+>>>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const html = (m[2] ?? "").trim();
    if (!/<section[^>]*class="[^"]*\bslide\b/.test(html)) {
      throw new Error(`Slide ${m[1]} is not a <section class="slide">`);
    }
    slides.push(html);
  }
  if (slides.length !== expectedSlides) {
    throw new Error(`Slide designer returned ${slides.length} slides, expected ${expectedSlides}`);
  }
  const allowed = new Set<string>(DESIGN_FONT_FAMILIES);
  const fonts = (fontsMatch?.[1] ?? "")
    .split(/[,\n]/)
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => allowed.has(f))
    .slice(0, 3);
  return { themeCss: themeMatch[1]!.trim(), fonts, slides };
}

/** Design every slide of the deck (cover + one per plan slide). */
export async function designPresentationSlides(
  brief: SlideDesignBrief,
  config: SlideDesignerConfig = slideDesignerConfigFromEnv(),
  signal?: AbortSignal,
): Promise<DesignedDeck> {
  const raw = await callDesigner(
    [
      {
        role: "user",
        content: `${briefForPrompt(brief)}\n\nCONTENT:\n${contentForPrompt(brief)}\n\nDesign the full deck now.`,
      },
    ],
    config,
    signal,
  );
  return parseDesignedDeck(raw, brief.plan.slides.length + 1);
}

/**
 * Re-design only the slides the renderer flagged. Returns the full deck with
 * those slides replaced; theme is kept unless the model returns a new one.
 */
export async function repairPresentationSlides(
  brief: SlideDesignBrief,
  repair: SlideRepairRequest,
  config: SlideDesignerConfig = slideDesignerConfigFromEnv(),
  signal?: AbortSignal,
): Promise<DesignedDeck> {
  const indices = [...repair.defects.keys()].sort((a, b) => a - b);
  const problems = indices
    .map((i) => `SLIDE ${i + 1}:\n${(repair.defects.get(i) ?? []).map((d) => `  - ${d}`).join("\n")}\n<<<CURRENT>>>\n${repair.deck.slides[i]}`)
    .join("\n\n");
  const raw = await callDesigner(
    [
      {
        role: "user",
        content: [
          briefForPrompt(brief),
          `THEME CSS IN USE:\n${repair.deck.themeCss}`,
          `The renderer found these defects. Redesign only these slides so they pass, keeping their content and the deck's visual system:\n\n${problems}`,
          `Reply with only the fixed slides, each as:\n<<<SLIDE n>>>\n<section class="slide">…</section>`,
        ].join("\n\n"),
      },
    ],
    config,
    signal,
  );
  const fixed = new Map<number, string>();
  const re = /<<<SLIDE (\d+)>>>\s*([\s\S]*?)(?=<<<SLIDE \d+>>>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = Number(m[1]) - 1;
    const html = (m[2] ?? "").trim();
    if (repair.defects.has(n) && /<section[^>]*class="[^"]*\bslide\b/.test(html)) fixed.set(n, html);
  }
  return {
    ...repair.deck,
    slides: repair.deck.slides.map((s, i) => fixed.get(i) ?? s),
  };
}
