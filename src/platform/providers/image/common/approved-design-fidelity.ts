/**
 * Approved-design fidelity check: compare a packaging follow-on render with
 * the approved creatives it must reproduce, and redraw it once with the exact
 * differences when they do not match.
 *
 * Image models copy an approved design closely but not exactly — the 2D pack
 * swapped two lines of the approved 3D front panel, and pack angles invented
 * panels. A vision model sees both and names each difference as a fix.
 *
 * Scope: packaging 2D Complete Pack (not a user refine — that change must
 * stand) and "Generate Angles" renders. Fails open: no key, a timeout or a bad
 * answer keeps the first render. Kill switch: CDF_FIDELITY_CHECK=off.
 */

import type { Result } from "../../../core/result";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import {
  extractReferenceImages,
  isApprovedDesignReference,
  orderReferencesForContinuity,
  requestIsRefinement,
  type ReferenceImagePayload,
} from "./vendor-image-protocol";

const MAX_APPROVED_IMAGES = 3;
const MAX_DIFFERENCES = 8;
const TIMEOUT_MS = 45_000;

type InlineImage = { mimeType: string; base64: string };
type FidelityKind = { kind: "flat_pack" } | { kind: "pack_angle"; angle: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function fidelityKind(
  metadata: Readonly<Record<string, unknown>> | undefined,
): FidelityKind | null {
  if (!metadata) return null;
  if ((process.env.CDF_FIDELITY_CHECK ?? "on").trim().toLowerCase() === "off") return null;
  if (metadata.cdfFidelityCorrection === true) return null;
  const service = str(metadata.cdfServiceId) || str(metadata.service);
  if (service.toLowerCase() !== "packaging") return null;
  const angle = str(metadata.cdfPackAngle);
  if (angle) return { kind: "pack_angle", angle };
  if (str(metadata.cdfPhaseId) === "complete-pack" && !requestIsRefinement(metadata)) {
    return { kind: "flat_pack" };
  }
  return null;
}

/** True when this image request is checked (and may be redrawn once). */
export function approvedDesignFidelityApplies(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return fidelityKind(metadata) !== null;
}

const COMMON_CHECKS = [
  "- every piece of text: exact wording and spelling, which lines exist, their top-to-bottom order, line breaks, relative size, weight and alignment",
  "- logo / emblem: present, its position relative to the text, its size",
  "- colour bands, stripes, borders and patterns: which edge they sit on, their order, width and colours",
  "- background colour of each panel",
].join("\n");

const REPLY_FORMAT = [
  "List ONLY real differences, each written as a direct fix instruction that names the panel and quotes the text,",
  'e.g. "Front panel: put \\"DiVastra\\" above \\"Sarees & Ethnic Wear\\" at the bottom, as in the approved design."',
  'Reply with JSON only: {"differences":["..."]} — an empty list when the new image matches.',
].join("\n");

function instructionFor(kind: FidelityKind, approvedCount: number): string {
  const approved =
    approvedCount > 1
      ? `Images 1–${approvedCount} are client-approved stages of this pack (Image 1 is the most recent authority).`
      : "Image 1 is the client-approved 3D pack — the design authority.";
  if (kind.kind === "flat_pack") {
    return [
      "You are a packaging pre-press checker.",
      approved,
      "The LAST image is a newly generated flat 2D sheet of the same pack. Every panel the approved images show must appear on the flat sheet exactly as approved.",
      "Compare each panel visible in the approved images (front/top face and any visible side) with the matching panel of the flat sheet:",
      COMMON_CHECKS,
      "Ignore: perspective, lighting, shadows, material texture, the flat layout itself (fold lines, flaps, glue tabs), panels the approved images do not show, and tiny rendering differences inside fine patterns.",
      REPLY_FORMAT,
    ].join("\n");
  }
  return [
    "You are a packaging pre-press checker.",
    approved,
    "The approved 3D pack fixes the pack's shape, proportions, lid/closure construction, material and finish; the approved flat 2D pack sheet fixes the artwork of every panel.",
    `The LAST image is a new render of the same pack from another viewpoint (requested: ${kind.angle}).`,
    "For every panel visible in the new render, compare it with the same panel in the approved images:",
    COMMON_CHECKS,
    "- pack shape, proportions, construction and material versus the approved 3D pack",
    `Also report it if the render does not show the requested viewpoint (${kind.angle}).`,
    "Ignore: camera angle, perspective, lighting, shadows and background.",
    REPLY_FORMAT,
  ].join("\n");
}

/** Parse `{"differences":[...]}`; null when unusable. */
export function parseFidelityDifferences(raw: string): string[] | null {
  const text = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = (parsed as { differences?: unknown })?.differences;
  if (!Array.isArray(list)) return null;
  return list
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_DIFFERENCES);
}

async function toInline(
  ref: { mimeType?: string; base64?: string; url?: string },
  signal: AbortSignal,
): Promise<InlineImage | null> {
  if (ref.base64?.trim()) return { mimeType: ref.mimeType || "image/png", base64: ref.base64.trim() };
  const url = ref.url?.trim() ?? "";
  const data = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (data?.[1] && data[2]) return { mimeType: data[1], base64: data[2] };
  if (!url.startsWith("http")) return null;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || ref.mimeType || "image/png";
  return { mimeType, base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
}

function firstOutputImage(
  response: ProviderExecutionResponse,
): { mimeType?: string; base64?: string; url?: string } | null {
  const outputs = (response.output as { outputs?: unknown }).outputs;
  if (!Array.isArray(outputs)) return null;
  for (const o of outputs) {
    const rec = o as Record<string, unknown>;
    if (rec?.type !== undefined && rec.type !== "image") continue;
    const base64 = str(rec.base64);
    const url = str(rec.url);
    if (base64 || url) {
      return {
        mimeType: str(rec.mimeType) || undefined,
        base64: base64 || undefined,
        url: url || undefined,
      };
    }
  }
  return null;
}

type Attempt = (signal: AbortSignal) => Promise<string>;

function geminiAttempt(instruction: string, images: readonly InlineImage[]): Attempt | null {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!key || process.env.GEMINI_ENABLED === "false") return null;
  const model = process.env.CDF_FIDELITY_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const parts: Record<string, unknown>[] = [];
  images.forEach((img, i) => {
    parts.push({ text: i === images.length - 1 ? `Image ${i + 1} (NEW — to check):` : `Image ${i + 1} (approved):` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  });
  return async (signal) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    return (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
  };
}

function openAiAttempt(instruction: string, images: readonly InlineImage[]): Attempt | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || process.env.OPENAI_ENABLED === "false") return null;
  const content: Record<string, unknown>[] = [];
  images.forEach((img, i) => {
    content.push({
      type: "text",
      text: i === images.length - 1 ? `Image ${i + 1} (NEW — to check):` : `Image ${i + 1} (approved):`,
    });
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
    });
  });
  return async (signal) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.CDF_FIDELITY_OPENAI_MODEL?.trim() || "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: instruction },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  };
}

/** Differences between the new render and the approved images; null = could not check. */
async function findDifferences(
  kind: FidelityKind,
  approved: readonly ReferenceImagePayload[],
  candidate: { mimeType?: string; base64?: string; url?: string },
): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const images: InlineImage[] = [];
    for (const ref of approved) {
      const img = await toInline(ref, controller.signal);
      if (img) images.push(img);
    }
    const output = await toInline(candidate, controller.signal);
    if (images.length === 0 || !output) return null;
    images.push(output);
    const instruction = instructionFor(kind, images.length - 1);
    const attempts = [geminiAttempt(instruction, images), openAiAttempt(instruction, images)].filter(
      (a): a is Attempt => a != null,
    );
    for (const attempt of attempts) {
      try {
        const differences = parseFidelityDifferences(await attempt(controller.signal));
        if (differences) return differences;
      } catch (err) {
        if (controller.signal.aborted) return null;
        logFidelity("check_attempt_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function logFidelity(event: string, fields: Record<string, unknown>): void {
  try {
    console.info(JSON.stringify({ scope: "cdf.fidelity", event, ...fields, ts: new Date().toISOString() }));
  } catch {
    // ignore
  }
}

/** The request again, with the differences to fix appended to its prompt. */
export function withFidelityCorrection(
  request: ProviderExecutionRequest,
  differences: readonly string[],
): ProviderExecutionRequest {
  const note = [
    "FIDELITY CORRECTION — the previous render differed from the approved design. Fix exactly these, and keep everything else identical to the approved images:",
    ...differences.map((d) => `- ${d}`),
  ].join("\n");
  const payload: Record<string, unknown> = { ...request.payload };
  for (const field of ["prompt", "text", "input"] as const) {
    if (typeof payload[field] === "string") payload[field] = `${payload[field]}\n\n${note}`;
  }
  return {
    ...request,
    payload,
    metadata: { ...(request.metadata ?? {}), cdfFidelityCorrection: true },
  };
}

/**
 * Run the image request; when it is a checked packaging stage and the render
 * differs from the approved images, redraw once with the differences listed.
 * Keeps the first render if the redraw fails or is judged further off.
 */
export async function dispatchWithApprovedDesignFidelity(
  request: ProviderExecutionRequest,
  dispatch: (request: ProviderExecutionRequest) => Promise<Result<ProviderExecutionResponse>>,
  isCancelled: () => boolean = () => false,
): Promise<Result<ProviderExecutionResponse>> {
  const kind = fidelityKind(request.metadata);
  const first = await dispatch(request);
  if (!kind || !first.ok) return first;

  const approved = orderReferencesForContinuity(
    extractReferenceImages(request.payload ?? {}, request.metadata),
  )
    .filter(isApprovedDesignReference)
    .slice(0, MAX_APPROVED_IMAGES);
  const firstImage = firstOutputImage(first.value);
  if (approved.length === 0 || !firstImage) return first;

  const executionId = str(request.context?.executionId) || request.requestId;
  const differences = await findDifferences(kind, approved, firstImage);
  logFidelity("checked", {
    executionId,
    kind: kind.kind,
    approvedImages: approved.length,
    differences,
  });
  if (!differences || differences.length === 0 || isCancelled()) return first;

  const second = await dispatch(withFidelityCorrection(request, differences));
  const secondImage = second.ok ? firstOutputImage(second.value) : null;
  if (!second.ok || !secondImage) {
    logFidelity("correction_failed", { executionId, kind: kind.kind });
    return first;
  }
  const remaining = await findDifferences(kind, approved, secondImage);
  const keepFirst = remaining !== null && remaining.length > differences.length;
  logFidelity("corrected", {
    executionId,
    kind: kind.kind,
    remaining,
    kept: keepFirst ? "first" : "correction",
  });
  return keepFirst ? first : second;
}
