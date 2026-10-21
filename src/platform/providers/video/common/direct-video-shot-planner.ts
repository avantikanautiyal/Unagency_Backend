/**
 * Direct video (no script / storyboard): turn the client's brief into a short
 * shot list so the film covers the whole brief — one fresh clip per shot —
 * instead of one clip extended from its own last frame.
 *
 * Called directly on a fast text model (like prompt-enhancer); null on any
 * failure so the caller falls back to a single brief-led prompt.
 */

export type PlannedShot = {
  readonly title: string;
  readonly visual: string;
};

const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 1_200;
const BRIEF_MAX_CHARS = 3_000;

const SYSTEM_INSTRUCTION = [
  "You are a film director planning a short premium video advert shot by shot for an AI video model.",
  "Each shot is generated separately as one continuous take, so describe exactly one setting, one subject action and one camera move per shot.",
  "Cover everything the brief asks for across the shots (every product, outfit, location, mood and detail it names) and keep wardrobe, people and look consistent.",
  "Write each visual as 40-70 words of concrete, photorealistic, cinematic description: subject, wardrobe and materials, action, setting, lighting, lens/camera move.",
  "Do not ask for on-screen text, captions or subtitles in any shot except the last.",
  "If the brief mentions a brand name or logo, the last shot is a clean, elegant brand reveal with the brand name; otherwise the last shot is a strong hero closing image.",
  "If a change request is given, it overrides the brief wherever they conflict and must be visibly applied.",
  'Return ONLY JSON: {"shots":[{"title":"...","visual":"..."}]} with exactly the requested number of shots.',
].join(" ");

function userMessage(input: {
  brief: string;
  changeRequest?: string;
  brandName?: string;
  shotCount: number;
  shotSec: number;
  aspectRatio?: string;
}): string {
  return [
    `Shots: exactly ${input.shotCount}, each about ${input.shotSec} seconds.`,
    input.aspectRatio ? `Frame: ${input.aspectRatio}.` : "",
    input.brandName ? `Brand: ${input.brandName}.` : "",
    input.changeRequest ? `Change request (must follow): ${input.changeRequest}` : "",
    "",
    "Brief:",
    input.brief.slice(0, BRIEF_MAX_CHARS),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function openAi(user: string, signal: AbortSignal): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || process.env.OPENAI_ENABLED === "false") return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.VIDEO_SHOT_PLANNER_OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.6,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? null;
}

async function gemini(user: string, signal: AbortSignal): Promise<string | null> {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!key || process.env.GEMINI_ENABLED === "false") return null;
  const model = process.env.VIDEO_SHOT_PLANNER_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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
          temperature: 0.6,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
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
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("") || null;
}

export function parsePlannedShots(raw: string, shotCount: number): PlannedShot[] | null {
  try {
    const text = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(text) as { shots?: unknown };
    if (!Array.isArray(parsed.shots)) return null;
    const shots = parsed.shots
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const r = s as Record<string, unknown>;
        const visual = typeof r.visual === "string" ? r.visual.trim() : "";
        if (!visual) return null;
        return { title: typeof r.title === "string" ? r.title.trim().slice(0, 80) : "", visual: visual.slice(0, 700) };
      })
      .filter((s): s is PlannedShot => s != null)
      .slice(0, shotCount);
    return shots.length >= 2 ? shots : null;
  } catch {
    return null;
  }
}

export async function planDirectVideoShots(input: {
  readonly brief: string;
  readonly changeRequest?: string;
  readonly brandName?: string;
  readonly shotCount: number;
  readonly shotSec: number;
  readonly aspectRatio?: string;
}): Promise<PlannedShot[] | null> {
  if (!input.brief.trim() || input.shotCount < 2) return null;
  const user = userMessage(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (const attempt of [openAi, gemini]) {
      try {
        const raw = await attempt(user, controller.signal);
        const shots = raw ? parsePlannedShots(raw, input.shotCount) : null;
        if (shots) return shots;
      } catch (err) {
        console.warn(
          `[direct-video-shots] planner attempt failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
