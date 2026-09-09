/**
 * Phase 6 — OpenAI vision runner for Visual Field Guide auditor.
 * Separate from image generation; returns structured pass/fail/uncertain per check.
 */

import type { ProductionHygieneCheck } from "../types";
import {
  setVisualFieldGuideJudgeRunner,
  type VisualFieldGuideJudgeCheckResult,
  type VisualFieldGuideJudgeRunner,
  type VisualFieldGuideJudgeVerdict,
} from "./vision-judge";

const DEFAULT_MODEL = "gpt-4o-mini";

export type CreateOpenAiVisualFieldGuideJudgeRunnerOptions = {
  readonly apiKey?: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

function resolveApiKey(explicit?: string): string | undefined {
  const key = (explicit ?? process.env.OPENAI_API_KEY)?.trim();
  return key || undefined;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    return JSON.parse(fence[1].trim());
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("Vision judge response did not contain JSON");
}

function normalizeVerdict(raw: unknown): VisualFieldGuideJudgeVerdict {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "pass" || s === "fail" || s === "uncertain") return s;
  return "uncertain";
}

function parseCheckResults(
  payload: unknown,
  checks: readonly ProductionHygieneCheck[],
): readonly VisualFieldGuideJudgeCheckResult[] {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const out: VisualFieldGuideJudgeCheckResult[] = [];
  const arr =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { checks?: unknown }).checks)
      ? (payload as { checks: unknown[] }).checks
      : [];

  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const checkId = typeof rec.checkId === "string" ? rec.checkId.trim() : "";
    if (!checkId || !byId.has(checkId) || seen.has(checkId)) continue;
    seen.add(checkId);
    const confidenceRaw = Number(rec.confidence);
    out.push(
      Object.freeze({
        checkId,
        verdict: normalizeVerdict(rec.verdict),
        rationale:
          typeof rec.rationale === "string" && rec.rationale.trim()
            ? rec.rationale.trim().slice(0, 500)
            : "No rationale",
        confidence: Number.isFinite(confidenceRaw)
          ? Math.min(1, Math.max(0, confidenceRaw))
          : 0.5,
      }),
    );
  }

  for (const c of checks) {
    if (seen.has(c.id)) continue;
    out.push(
      Object.freeze({
        checkId: c.id,
        verdict: "uncertain" as const,
        rationale: "Model omitted this check",
        confidence: 0,
      }),
    );
  }

  return Object.freeze(out);
}

function buildUserPrompt(input: {
  readonly rubricLines: readonly string[];
  readonly checks: readonly ProductionHygieneCheck[];
  readonly briefSummary?: string;
}): string {
  const checkSchema = input.checks.map((c) => ({
    checkId: c.id,
    passDefinition: c.passDefinition,
  }));
  return [
    "Evaluate the attached image against UNAGENCY Visual Field Guide gates.",
    "Respond with ONLY JSON of the form:",
    '{"checks":[{"checkId":"...","verdict":"pass"|"fail"|"uncertain","rationale":"...","confidence":0.0}]}',
    "Prefer uncertain over false pass. Do not invent checks.",
    "",
    "Rubric:",
    ...input.rubricLines.map((l) => `- ${l}`),
    "",
    `Checks JSON: ${JSON.stringify(checkSchema)}`,
    input.briefSummary?.trim()
      ? `\nBrief context: ${input.briefSummary.trim().slice(0, 800)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Create a Field Guide vision judge that calls OpenAI Chat Completions (vision).
 * Returns undefined when no API key is available (caller should leave runner unset).
 */
export function createOpenAiVisualFieldGuideJudgeRunner(
  options: CreateOpenAiVisualFieldGuideJudgeRunnerOptions = {},
): VisualFieldGuideJudgeRunner | undefined {
  const apiKey = resolveApiKey(options.apiKey);
  if (!apiKey) return undefined;

  const model =
    options.model?.trim() ||
    process.env.VISUAL_FIELD_GUIDE_VISION_MODEL?.trim() ||
    DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;

  const runner: VisualFieldGuideJudgeRunner = async (input) => {
    if (input.checks.length === 0) return Object.freeze([]);

    let imageUrl: string | undefined;
    if (input.imageUrl && /^https?:\/\//i.test(input.imageUrl)) {
      imageUrl = input.imageUrl;
    } else if (input.imageBytes && input.imageBytes.length > 0) {
      const mime = input.mimeType?.trim() || "image/png";
      imageUrl = `data:${mime};base64,${input.imageBytes.toString("base64")}`;
    } else if (
      input.imageUrl &&
      input.imageUrl.startsWith("data:") &&
      input.imageUrl.includes(";base64,")
    ) {
      imageUrl = input.imageUrl;
    }

    if (!imageUrl) {
      return Object.freeze(
        input.checks.map((c) =>
          Object.freeze({
            checkId: c.id,
            verdict: "uncertain" as const,
            rationale: "No image bytes or URL available for vision judge",
            confidence: 0,
          }),
        ),
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an UNAGENCY Visual Field Guide auditor. Output JSON only. Never generate creative assets.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: buildUserPrompt({
                    rubricLines: input.rubricLines,
                    checks: input.checks,
                    briefSummary: input.briefSummary,
                  }),
                },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `OpenAI vision judge HTTP ${res.status}: ${body.slice(0, 200)}`,
        );
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const parsed = extractJsonObject(content);
      return parseCheckResults(parsed, input.checks);
    } finally {
      clearTimeout(timer);
    }
  };

  return runner;
}

/** Register OpenAI Field Guide vision runner when API key is present. */
export function registerOpenAiVisualFieldGuideJudgeRunner(
  options: CreateOpenAiVisualFieldGuideJudgeRunnerOptions = {},
): boolean {
  const runner = createOpenAiVisualFieldGuideJudgeRunner(options);
  setVisualFieldGuideJudgeRunner(runner);
  return Boolean(runner);
}
