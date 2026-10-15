/**
 * Enhance Prompt — rewrite a creative brief in about a second.
 *
 * Deliberately NOT an execution: no prepass, governance, job queue or polling
 * (that path took 10–20s and timed out). A fast model is called directly;
 * if it has not answered after HEDGE_AFTER_MS a second provider races it and
 * the first usable answer wins. Identical requests are served from a short
 * in-memory cache so repeat taps are instant.
 */

import { createHash } from "crypto";

export type EnhancePromptInput = {
  readonly prompt: string;
  readonly brandName?: string;
  readonly brandSummary?: string;
  readonly brandColors?: readonly string[];
  /** What is being made, e.g. "Presentations · Pitch decks". */
  readonly deliverable?: string;
};

export type EnhancePromptResult = {
  readonly text: string;
  readonly provider: string;
  readonly ms: number;
  readonly cached: boolean;
};

const HEDGE_AFTER_MS = 2_500;
const TOTAL_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_TOKENS = 450;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
export const ENHANCE_PROMPT_MAX_CHARS = 6_000;

const SYSTEM_INSTRUCTION = [
  "You rewrite a client's creative brief into a clearer, more specific prompt for generating marketing creatives.",
  "Preserve the original intent, brand goal, language and every concrete detail (names, products, audience, colours, dates).",
  'Preserve ALL explicit prohibitions and hard constraints verbatim (e.g. "no leaf", "do not use green").',
  "Never replace prohibitions with generic sustainability, nature, eco or recycling language. Never invent facts, numbers or claims.",
  "Write natural, easy-to-read sentences — no bracketed tags, checklists, export formats, pixel sizes or colour-space specs unless the brief asks for them.",
  "Keep it concise: at most about 120 words.",
  "Return ONLY the enhanced prompt text — no preamble, labels, markdown or quotation marks.",
].join(" ");

function userMessage(input: EnhancePromptInput): string {
  const context = [
    input.deliverable?.trim() ? `Deliverable: ${input.deliverable.trim()}` : "",
    input.brandName?.trim() ? `Brand: ${input.brandName.trim()}` : "",
    input.brandSummary?.trim() ? `About the brand: ${input.brandSummary.trim().slice(0, 600)}` : "",
    input.brandColors?.length
      ? `Brand colours: ${input.brandColors.slice(0, 6).join(", ")}`
      : "",
  ].filter(Boolean);
  return [
    ...(context.length ? ["Context (use only if relevant):", ...context, ""] : []),
    "Brief:",
    input.prompt.trim(),
  ].join("\n");
}

/** Strip wrappers models sometimes add despite instructions. */
export function cleanEnhancedText(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  text = text.replace(/^(enhanced (prompt|brief)|prompt|brief)\s*:\s*/i, "");
  if (/^["“][\s\S]*["”]$/.test(text)) text = text.slice(1, -1);
  return text.trim();
}

type Attempt = (signal: AbortSignal) => Promise<string>;

function openAiAttempt(user: string): Attempt | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || process.env.OPENAI_ENABLED === "false") return null;
  return async (signal) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.ENHANCE_OPENAI_MODEL?.trim() || "gpt-4o-mini",
        temperature: 0.5,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? "";
  };
}

function geminiAttempt(user: string): Attempt | null {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!key || process.env.GEMINI_ENABLED === "false") return null;
  const model = process.env.ENHANCE_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  return async (signal) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // Rewriting needs no reasoning budget — thinking only adds latency.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  };
}

const cache = new Map<string, { untilMs: number; text: string; provider: string }>();

function cacheKey(input: EnhancePromptInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.prompt.trim(),
        input.brandName ?? "",
        input.brandSummary ?? "",
        input.brandColors ?? [],
        input.deliverable ?? "",
      ]),
    )
    .digest("hex");
}

export async function enhancePrompt(input: EnhancePromptInput): Promise<EnhancePromptResult> {
  const started = Date.now();
  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit && hit.untilMs > started) {
    return { text: hit.text, provider: hit.provider, ms: 0, cached: true };
  }

  const user = userMessage(input);
  const candidates = [
    { name: "openai", attempt: openAiAttempt(user) },
    { name: "gemini", attempt: geminiAttempt(user) },
  ].filter((c): c is { name: string; attempt: Attempt } => c.attempt != null);
  if (candidates.length === 0) {
    throw new Error("No text provider is configured for Enhance Prompt");
  }

  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  try {
    const result = await new Promise<{ text: string; provider: string }>((resolve, reject) => {
      let pending = 0;
      let launched = 0;
      let settled = false;
      const errors: string[] = [];
      let hedgeTimer: NodeJS.Timeout | undefined;

      const launch = (index: number) => {
        const candidate = candidates[index];
        if (!candidate || settled) return;
        launched = Math.max(launched, index + 1);
        pending += 1;
        candidate
          .attempt(controller.signal)
          .then((raw) => {
            const text = cleanEnhancedText(raw);
            if (!text) throw new Error(`${candidate.name} returned no text`);
            if (!settled) {
              settled = true;
              resolve({ text, provider: candidate.name });
            }
          })
          .catch((err: unknown) => {
            errors.push(err instanceof Error ? err.message : String(err));
            // A failure starts the next provider right away.
            if (!settled && launched < candidates.length) launch(launched);
          })
          .finally(() => {
            pending -= 1;
            if (!settled && pending === 0 && launched >= candidates.length) {
              settled = true;
              reject(new Error(errors.join("; ") || "Enhance failed"));
            }
          });
      };

      launch(0);
      if (candidates.length > 1) {
        hedgeTimer = setTimeout(() => {
          if (!settled && launched < 2) launch(1);
        }, HEDGE_AFTER_MS);
      }
      controller.signal.addEventListener("abort", () => {
        if (hedgeTimer) clearTimeout(hedgeTimer);
        if (!settled) {
          settled = true;
          reject(new Error("Enhance timed out"));
        }
      });
    });

    cache.set(key, { untilMs: Date.now() + CACHE_TTL_MS, ...result });
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return { ...result, ms: Date.now() - started, cached: false };
  } finally {
    clearTimeout(overall);
    // Cancel the losing request so it never costs more tokens or time.
    controller.abort();
  }
}
