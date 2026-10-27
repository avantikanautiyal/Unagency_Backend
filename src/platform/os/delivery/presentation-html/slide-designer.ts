/**
 * Model-designed presentation slides.
 *
 * Instead of filling a fixed template, a model designs every slide as a
 * self-contained HTML/CSS composition on a 1920×1080 canvas, sharing one
 * deck-level theme so the deck stays consistent. The renderer then paints
 * the HTML in headless Chrome (PDF, PNG previews, editable PPTX).
 *
 * Claude designs; GPT and then Gemini take over when it fails, so a deck
 * only falls back to the template renderer when all three are down.
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
  /** Provider that designed it; repairs go to it first so the style stays one hand. */
  readonly designedBy?: DesignerProviderId;
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

/** Who can design a deck, in fallback order. */
export type DesignerProviderId = "anthropic" | "openai" | "gemini";

type DesignerCall = (user: string, config: SlideDesignerConfig, signal?: AbortSignal) => Promise<string>;

const enabled = (flag: string | undefined) => (flag ?? "true").trim().toLowerCase() !== "false";

/**
 * Providers that can run, in order. Claude designs; GPT and Gemini step in
 * when it fails (billing, outage, timeout, unusable answer) so a deck never
 * drops to the template renderer just because one vendor is down.
 * PRESENTATION_DESIGN_PROVIDERS reorders or trims the list.
 */
export function designerProviders(env = process.env): DesignerProviderId[] {
  const available: Record<DesignerProviderId, boolean> = {
    anthropic: enabled(env.ANTHROPIC_ENABLED) && Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()),
    openai: enabled(env.OPENAI_ENABLED) && Boolean(env.OPENAI_API_KEY?.trim()),
    gemini: enabled(env.GEMINI_ENABLED) && Boolean((env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim()),
  };
  const order = (env.PRESENTATION_DESIGN_PROVIDERS ?? "anthropic,openai,gemini")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is DesignerProviderId => p === "anthropic" || p === "openai" || p === "gemini");
  return [...new Set(order)].filter((p) => available[p]);
}

export function slideDesignerAvailable(env = process.env): boolean {
  if ((env.PRESENTATION_RENDERER ?? "").trim().toLowerCase() === "template") return false;
  return designerProviders(env).length > 0;
}

const callAnthropic: DesignerCall = async (user, config, signal) => {
  const stream = client().beta.messages.stream(
    {
      model: config.model,
      max_tokens: 64_000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: config.effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: user }],
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
};

/** Abort on the caller's signal or after the timeout, whichever comes first. */
function deadline(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * Read a server-sent-events body, handing each JSON `data:` payload to onEvent.
 * Streamed so a several-minute generation never hits fetch's 5-minute
 * wait-for-headers limit.
 */
async function readSse(res: Response, onEvent: (data: unknown) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      onEvent(JSON.parse(data));
    }
  }
}

const callOpenAi: DesignerCall = async (user, config, signal) => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: deadline(config.timeoutMs, signal),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.PRESENTATION_DESIGN_OPENAI_MODEL?.trim() || "gpt-5.5",
      stream: true,
      max_completion_tokens: 64_000,
      reasoning_effort: "medium",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  let text = "";
  let finish: string | null = null;
  await readSse(res, (data) => {
    const choice = (data as { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] }).choices?.[0];
    text += choice?.delta?.content ?? "";
    finish = choice?.finish_reason ?? finish;
  });
  if (finish === "length") throw new Error("Slide designer ran out of output tokens");
  if (finish === "content_filter") throw new Error("Slide designer declined the request");
  return text;
};

const callGemini: DesignerCall = async (user, config, signal) => {
  const model = process.env.PRESENTATION_DESIGN_GEMINI_MODEL?.trim() || "gemini-pro-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      signal: deadline(config.timeoutMs, signal),
      headers: {
        "x-goog-api-key": (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!.trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 65_536 },
      }),
    },
  );
  let text = "";
  let finish: string | undefined;
  await readSse(res, (data) => {
    const cand = (data as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    }).candidates?.[0];
    for (const part of cand?.content?.parts ?? []) if (part.text && !part.thought) text += part.text;
    finish = cand?.finishReason ?? finish;
  });
  if (finish === "MAX_TOKENS") throw new Error("Slide designer ran out of output tokens");
  if (finish === "SAFETY" || finish === "RECITATION" || finish === "PROHIBITED_CONTENT") {
    throw new Error("Slide designer declined the request");
  }
  return text;
};

const DESIGNER_CALLS: Record<DesignerProviderId, DesignerCall> = {
  anthropic: callAnthropic,
  openai: callOpenAi,
  gemini: callGemini,
};

/**
 * Run `use` on each provider in turn until one succeeds. `use` covers the
 * call and reading the answer, so an unusable answer also moves on.
 */
async function withDesignerFallback<T>(
  label: string,
  user: string,
  config: SlideDesignerConfig,
  use: (raw: string) => T,
  options: { readonly signal?: AbortSignal; readonly prefer?: DesignerProviderId } = {},
): Promise<{ readonly value: T; readonly provider: DesignerProviderId }> {
  const providers = designerProviders();
  if (options.prefer && providers.includes(options.prefer)) {
    providers.splice(providers.indexOf(options.prefer), 1);
    providers.unshift(options.prefer);
  }
  if (!providers.length) throw new Error("No slide designer provider is configured");
  const failures: string[] = [];
  for (const provider of providers) {
    if (options.signal?.aborted) break;
    const started = Date.now();
    try {
      const value = use(await DESIGNER_CALLS[provider](user, config, options.signal));
      if (failures.length) {
        console.warn(`[presentation-html] ${label} done by fallback provider ${provider} after: ${failures.join(" | ")}`);
      }
      return { value, provider };
    } catch (err) {
      const reason = err instanceof Error ? err.message.split("\n")[0]! : String(err);
      failures.push(`${provider}: ${reason.slice(0, 200)} (${Math.round((Date.now() - started) / 1000)}s)`);
      console.warn(`[presentation-html] ${label} failed on ${provider}; trying next provider: ${reason.slice(0, 300)}`);
    }
  }
  throw new Error(`All slide designer providers failed — ${failures.join(" | ")}`);
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

/**
 * Slides per parallel design call after the first (system) call. One call
 * writing a whole deck took ~30 s per slide (15 slides ≈ 7.5 min); batches
 * run side by side. 0 turns the split off (one call for the whole deck).
 */
export function designBatchSize(env = process.env): number {
  const raw = (env.PRESENTATION_DESIGN_BATCH_SIZE ?? "").trim();
  const n = Number(raw);
  return raw && Number.isInteger(n) && n >= 0 ? n : 3;
}

/** Most batch calls in flight per deck (decks themselves also run in parallel). */
function designConcurrency(env = process.env): number {
  const n = Number(env.PRESENTATION_DESIGN_CONCURRENCY);
  return Number.isInteger(n) && n > 0 ? n : 5;
}

/** Slides the first call designs as the reference look (cover + first content slide). */
const SYSTEM_SLIDES = 2;

/** Design every slide of the deck (cover + one per plan slide). */
export async function designPresentationSlides(
  brief: SlideDesignBrief,
  config: SlideDesignerConfig = slideDesignerConfigFromEnv(),
  signal?: AbortSignal,
): Promise<DesignedDeck> {
  const total = brief.plan.slides.length + 1;
  const batch = designBatchSize();
  // Split only when it pays: at least two batches after the system call.
  if (batch > 0 && total - SYSTEM_SLIDES > batch) {
    try {
      return await designDeckInParts(brief, config, batch, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn(
        `[presentation-html] parallel deck design failed; designing in one call: ${
          err instanceof Error ? err.message.split("\n")[0] : String(err)
        }`,
      );
    }
  }
  const { value, provider } = await withDesignerFallback(
    "deck design",
    `${briefForPrompt(brief)}\n\nCONTENT:\n${contentForPrompt(brief)}\n\nDesign the full deck now.`,
    config,
    (raw) => parseDesignedDeck(raw, total),
    signal ? { signal } : {},
  );
  return { ...value, designedBy: provider };
}

type DeckSystem = {
  readonly fonts: readonly string[];
  readonly themeCss: string;
  /** One line per slide: composition, dominant element, visual device. */
  readonly layoutPlan: string;
  /** Slides 1..SYSTEM_SLIDES, the look every batch matches. */
  readonly slides: readonly string[];
};

/** Parse the system call: fonts, theme, layout plan and the first slides. */
export function parseDeckSystem(raw: string, systemSlides: number): DeckSystem {
  const text = raw.replace(/^```[a-z]*\n?|```\s*$/gim, "");
  const fontsMatch = text.match(/<<<FONTS>>>\s*([\s\S]*?)<<<THEME>>>/);
  const themeMatch = text.match(/<<<THEME>>>\s*([\s\S]*?)<<<PLAN>>>/);
  const planMatch = text.match(/<<<PLAN>>>\s*([\s\S]*?)<<<SLIDE 1>>>/);
  if (!themeMatch || !planMatch) throw new Error("Deck system response has no theme or plan block");
  const slides = parseSlideBlocks(text);
  const out: string[] = [];
  for (let n = 1; n <= systemSlides; n += 1) {
    const html = slides.get(n);
    if (!html) throw new Error(`Deck system response is missing slide ${n}`);
    out.push(html);
  }
  const allowed = new Set<string>(DESIGN_FONT_FAMILIES);
  const fonts = (fontsMatch?.[1] ?? "")
    .split(/[,\n]/)
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => allowed.has(f))
    .slice(0, 3);
  return { fonts, themeCss: themeMatch[1]!.trim(), layoutPlan: planMatch[1]!.trim(), slides: out };
}

/** `<<<SLIDE n>>>` blocks that hold a `<section class="slide">`, by 1-based number. */
function parseSlideBlocks(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /<<<SLIDE (\d+)>>>\s*([\s\S]*?)(?=<<<SLIDE \d+>>>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const html = (m[2] ?? "").trim();
    if (/<section[^>]*class="[^"]*\bslide\b/.test(html)) out.set(Number(m[1]), html);
  }
  return out;
}

/** Move a slide's own `<style>` blocks out of its markup (they join the theme). */
export function splitSlideStyles(html: string): { html: string; css: string } {
  const css: string[] = [];
  const stripped = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_m, body: string) => {
    css.push(body.trim());
    return "";
  });
  return { html: stripped, css: css.filter(Boolean).join("\n") };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Same design, faster: one call sets the deck system (fonts, theme, a layout
 * plan for every slide, and the first slides as the reference look); the
 * remaining slides are then designed in parallel batches that all get that
 * system, so the deck stays one hand.
 */
async function designDeckInParts(
  brief: SlideDesignBrief,
  config: SlideDesignerConfig,
  batchSize: number,
  signal?: AbortSignal,
): Promise<DesignedDeck> {
  const total = brief.plan.slides.length + 1;
  const started = Date.now();
  const context = `${briefForPrompt(brief)}\n\nCONTENT:\n${contentForPrompt(brief)}`;
  const { value: system, provider } = await withDesignerFallback(
    "deck system",
    [
      context,
      `This deck is designed in parts that run in parallel. In this first part, set up the deck's visual system and design slides 1–${SYSTEM_SLIDES} only.`,
      `Output exactly this, with no other text and no markdown fences:
<<<FONTS>>>
Family One, Family Two
<<<THEME>>>
(CSS for the whole deck, including every reusable class the other slides will need: type scale, colours, grids, stat blocks, chart / diagram / timeline parts, rules, page numbers, section markers, logo placement)
<<<PLAN>>>
(one line for EACH of the ${total} slides: "n: composition — dominant element — visual device". Consecutive slides use different compositions.)
${Array.from({ length: SYSTEM_SLIDES }, (_, i) => `<<<SLIDE ${i + 1}>>>\n<section class="slide">…</section>`).join("\n")}`,
    ].join("\n\n"),
    config,
    (raw) => parseDeckSystem(raw, SYSTEM_SLIDES),
    signal ? { signal } : {},
  );
  const systemMs = Date.now() - started;

  const batches: number[][] = [];
  for (let n = SYSTEM_SLIDES + 1; n <= total; n += batchSize) {
    batches.push(Array.from({ length: Math.min(batchSize, total - n + 1) }, (_, i) => n + i));
  }
  const reference = system.slides.map((html, i) => `<<<SLIDE ${i + 1}>>>\n${html}`).join("\n");
  const results = await mapLimit(batches, designConcurrency(), async (numbers) => {
    const range = `${numbers[0]}–${numbers[numbers.length - 1]}`;
    const { value } = await withDesignerFallback(
      `slides ${range}`,
      [
        context,
        `THEME CSS IN USE (already loaded for every slide):\n${system.themeCss}`,
        `LAYOUT PLAN FOR THE WHOLE DECK:\n${system.layoutPlan}`,
        `ALREADY DESIGNED — match this look exactly (same type, spacing, devices, logo placement):\n${reference}`,
        `Design only slides ${range} now, each following its plan line and reusing the theme's classes. Do not redefine theme classes. If a slide needs extra CSS, put it in one <style> as the first child of its section, give that section the extra class "s<n>" (n = its slide number) and start every selector with ".slide.s<n>".`,
        `Reply with only these slides, each as:\n<<<SLIDE n>>>\n<section class="slide">…</section>`,
      ].join("\n\n"),
      config,
      (raw) => {
        const found = parseSlideBlocks(raw.replace(/^```[a-z]*\n?|```\s*$/gim, ""));
        const missing = numbers.filter((n) => !found.has(n));
        if (missing.length) throw new Error(`Slide batch is missing slide(s) ${missing.join(", ")}`);
        return numbers.map((n) => found.get(n)!);
      },
      // The provider that set the system designs the rest, so the style stays one hand.
      { ...(signal ? { signal } : {}), prefer: provider },
    );
    return value;
  });

  const extraCss: string[] = [];
  const later = results.flat().map((html) => {
    const split = splitSlideStyles(html);
    if (split.css) extraCss.push(split.css);
    return split.html;
  });
  console.log(
    `[presentation-html] deck designed in parts | slides=${total} | batches=${batches.length}x${batchSize} | systemMs=${systemMs} | totalMs=${Date.now() - started}`,
  );
  return {
    fonts: system.fonts,
    themeCss: [system.themeCss, ...extraCss].join("\n"),
    slides: [...system.slides, ...later],
    designedBy: provider,
  };
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
  const { value: fixed } = await withDesignerFallback(
    "slide repair",
    [
      briefForPrompt(brief),
      `THEME CSS IN USE:\n${repair.deck.themeCss}`,
      `The renderer found these defects. Redesign only these slides so they pass, keeping their content and the deck's visual system:\n\n${problems}`,
      `Reply with only the fixed slides, each as:\n<<<SLIDE n>>>\n<section class="slide">…</section>`,
    ].join("\n\n"),
    config,
    (raw) => {
      const out = new Map<number, string>();
      const re = /<<<SLIDE (\d+)>>>\s*([\s\S]*?)(?=<<<SLIDE \d+>>>|$)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        const n = Number(m[1]) - 1;
        const html = (m[2] ?? "").trim();
        if (repair.defects.has(n) && /<section[^>]*class="[^"]*\bslide\b/.test(html)) out.set(n, html);
      }
      if (!out.size) throw new Error("Slide repair returned no usable slides");
      return out;
    },
    { ...(signal ? { signal } : {}), ...(repair.deck.designedBy ? { prefer: repair.deck.designedBy } : {}) },
  );
  return {
    ...repair.deck,
    slides: repair.deck.slides.map((s, i) => fixed.get(i) ?? s),
  };
}
