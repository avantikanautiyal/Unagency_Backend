/**
 * Looks at attached images and decides what each one IS: the brand logo, the
 * product/object the creative is about, or a style/mood reference.
 *
 * Filename and brief wording were not enough: users attach a logo without
 * saying so, or a logo together with product photos — every image was then
 * treated the same (all logos, or all products). A vision model sees the
 * pixels, with the brief for context. Verdicts are cached on the asset, so
 * each image is classified once.
 *
 * Fails open: with no key, a timeout or a bad answer, callers keep their
 * existing rule (attached photo = product).
 */

export type AttachmentRole = "logo" | "product" | "style_reference";

export type AttachmentForClassification = {
  readonly assetId: string;
  /** data: URL (as returned by resolveProviderInputAsset). */
  readonly dataUrl: string;
  readonly fileName?: string;
};

const ROLES: ReadonlySet<string> = new Set(["logo", "product", "style_reference"]);
const MAX_IMAGES = 6;
const TIMEOUT_MS = 8000;

const INSTRUCTION = [
  "You label images a client attached to a creative brief.",
  "For EACH image (numbered in order) pick exactly one role:",
  '- "logo": a brand logo, wordmark, emblem or brand mark — flat graphic artwork,',
  "  usually on a plain or transparent background, meant to identify the brand.",
  '- "product": a photo or render of a physical product/object/item the creative',
  "  must show (jewellery, packaging, food, clothing, a device, a person or place to feature).",
  '- "style_reference": an example of a look, mood, layout or past campaign to take',
  "  inspiration from, not an item to reproduce.",
  "A product photo that happens to show a printed logo on the product is still \"product\".",
  "Use the brief to break ties (e.g. \"in this style\" → style_reference).",
  'Reply with JSON only: {"images":[{"index":1,"role":"logo"},...]}',
].join("\n");

function enabled(): boolean {
  return (process.env.ATTACHMENT_ROLE_CLASSIFIER ?? "on").trim().toLowerCase() !== "off";
}

function splitDataUrl(url: string): { mimeType: string; base64: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], base64: match[2] };
}

function userText(brief: string, items: readonly AttachmentForClassification[]): string {
  const names = items
    .map((item, i) => `Image ${i + 1}${item.fileName ? ` (file: ${item.fileName})` : ""}`)
    .join("\n");
  return `Brief:\n${brief.slice(0, 1500) || "(none)"}\n\n${names}`;
}

/** Parse `{"images":[{index,role}]}` → roles by position; null when unusable. */
export function parseAttachmentRoles(
  raw: string,
  count: number,
): (AttachmentRole | undefined)[] | null {
  const text = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const images = (parsed as { images?: unknown })?.images;
  if (!Array.isArray(images)) return null;
  const out: (AttachmentRole | undefined)[] = new Array(count).fill(undefined);
  for (const entry of images) {
    const rec = entry as { index?: unknown; role?: unknown };
    const index = Number(rec.index);
    const role = String(rec.role ?? "").trim().toLowerCase();
    if (Number.isInteger(index) && index >= 1 && index <= count && ROLES.has(role)) {
      out[index - 1] = role as AttachmentRole;
    }
  }
  return out.some(Boolean) ? out : null;
}

type Attempt = (signal: AbortSignal) => Promise<string>;

function geminiAttempt(
  brief: string,
  items: readonly AttachmentForClassification[],
): Attempt | null {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!key || process.env.GEMINI_ENABLED === "false") return null;
  const model = process.env.ATTACHMENT_ROLE_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const parts: Record<string, unknown>[] = [{ text: userText(brief, items) }];
  items.forEach((item, i) => {
    const data = splitDataUrl(item.dataUrl);
    if (!data) return;
    parts.push({ text: `Image ${i + 1}:` });
    parts.push({ inlineData: { mimeType: data.mimeType, data: data.base64 } });
  });
  return async (signal) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTION }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
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

function openAiAttempt(
  brief: string,
  items: readonly AttachmentForClassification[],
): Attempt | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || process.env.OPENAI_ENABLED === "false") return null;
  const content: Record<string, unknown>[] = [{ type: "text", text: userText(brief, items) }];
  items.forEach((item, i) => {
    content.push({ type: "text", text: `Image ${i + 1}:` });
    content.push({ type: "image_url", image_url: { url: item.dataUrl, detail: "low" } });
  });
  return async (signal) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.ATTACHMENT_ROLE_OPENAI_MODEL?.trim() || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCTION },
          { role: "user", content },
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

/**
 * Role per assetId for the given images (missing = unknown). Never throws.
 */
export async function classifyAttachmentRoles(input: {
  readonly brief: string;
  readonly attachments: readonly AttachmentForClassification[];
}): Promise<Map<string, AttachmentRole>> {
  const result = new Map<string, AttachmentRole>();
  if (!enabled()) return result;
  const items = input.attachments
    .filter((a) => a.dataUrl.startsWith("data:image/"))
    .slice(0, MAX_IMAGES);
  if (items.length === 0) return result;

  const attempts = [geminiAttempt(input.brief, items), openAiAttempt(input.brief, items)].filter(
    (a): a is Attempt => a != null,
  );
  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const roles = parseAttachmentRoles(await attempt(controller.signal), items.length);
      if (!roles) continue;
      roles.forEach((role, i) => {
        if (role) result.set(items[i]!.assetId, role);
      });
      return result;
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: "attachment_role_classifier",
          event: "attempt_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return result;
}
