/**
 * Approved-design fidelity check: compare a follow-on render with the approved
 * creatives it must be built from, and redraw it once with the exact
 * differences when they do not match.
 *
 * Image models copy an approved design closely but not exactly — the 2D pack
 * swapped two lines of the approved 3D front panel, pack angles invented
 * panels, and a store mockup built a new store instead of placing the approved
 * POSM panels. A vision model sees both and names each difference as a fix.
 *
 * Scope: every CDF image stage that received an approved earlier image
 * (mockups, 2D pack, angles, final illustration, logo sheet, adaptations) —
 * not a user refine (that change must stand) and not a set of alternative
 * options. Fails open: no key, a timeout or a bad answer keeps the first
 * render. When the final render still is not the approved design, the
 * creative is kept with a short note for the client (cdfDeliveryNote).
 * Kill switch: CDF_FIDELITY_CHECK=off.
 */

import type { Result } from "../../../core/result";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import { downscaleForVision } from "./downscale-image";
import {
  approvedStageMode,
  extractReferenceImages,
  isApprovedDesignReference,
  orderReferencesForContinuity,
  requestIsOneOfSeveralOptions,
  requestIsRefinement,
  type ReferenceImagePayload,
} from "./vendor-image-protocol";

const MAX_APPROVED_IMAGES = 3;
const MAX_DIFFERENCES = 8;
const TIMEOUT_MS = 30_000;

type InlineImage = { mimeType: string; base64: string };
type FidelityKind =
  | { kind: "flat_pack" }
  | { kind: "pack_angle"; angle: string }
  | { kind: "mockup"; stage: string }
  | { kind: "follow_on"; stage: string };

/** Shown with the creative when the approved design could not be carried over. */
export const CDF_DELIVERY_NOTE_FROM_BRIEF =
  "We've built this one fresh from your brief — the approved version didn't quite translate to this format to the standard we hold ourselves to. If you'd like it closer to your earlier approval, just tap Refine and tell us what to keep.";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function fidelityKind(
  metadata: Readonly<Record<string, unknown>> | undefined,
): FidelityKind | null {
  if (!metadata) return null;
  if ((process.env.CDF_FIDELITY_CHECK ?? "on").trim().toLowerCase() === "off") return null;
  if (metadata.cdfFidelityCorrection === true) return null;
  const phaseId = str(metadata.cdfPhaseId);
  const service = (str(metadata.cdfServiceId) || str(metadata.service)).toLowerCase();
  const angle = str(metadata.cdfPackAngle);
  if (service === "packaging" && angle) return { kind: "pack_angle", angle };
  // The user's requested change must stand — it is not drift.
  if (requestIsRefinement(metadata) || requestIsOneOfSeveralOptions(metadata)) return null;
  if (service === "packaging" && phaseId === "complete-pack") return { kind: "flat_pack" };
  const modality = str(metadata.cdfGenerationModality) || str(metadata.generationModality);
  if (modality && modality !== "image") return null;
  // Any other stage that actually received an approved earlier creative.
  const continuesApproved =
    metadata.cdfUpstreamVisualHandoffApplied === true ||
    Boolean(str(metadata.cdfContinuationVisualArtifactId));
  if (!phaseId || !continuesApproved) return null;
  const stage = phaseId.replace(/[-_]+/g, " ");
  return approvedStageMode(metadata) === "placement" || /mockup/i.test(phaseId)
    ? { kind: "mockup", stage }
    : { kind: "follow_on", stage };
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
  if (kind.kind === "mockup" || kind.kind === "follow_on") {
    return genericInstruction(kind, approvedCount);
  }
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
      "- pack type: the flat sheet must be the SAME kind of pack as the approved 3D, unrolled or unfolded (a tube or bottle becomes one wrap rectangle; only a box becomes a carton dieline). If it shows a different pack — e.g. a carton/outer-box dieline for a tube, bottle, jar or pouch — list that FIRST as a fix.",
      "Ignore: perspective, lighting, shadows, material texture, the details of the flat layout (fold lines, flaps, glue tabs, seal bands), panels the approved images do not show, and tiny rendering differences inside fine patterns.",
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

const GENERIC_REPLY_FORMAT = [
  "List ONLY real, clearly visible differences, each written as a direct fix instruction that names the surface/panel and quotes the text.",
  'Set "approvedDesignMissing" to true only when the approved design is not recognisably in the new image at all (it was replaced by a different design).',
  'Reply with JSON only: {"approvedDesignMissing":false,"differences":["..."]} — an empty list when the new image matches.',
].join("\n");

function genericInstruction(
  kind: { kind: "mockup" | "follow_on"; stage: string },
  approvedCount: number,
): string {
  const approved =
    approvedCount > 1
      ? `Images 1–${approvedCount} are client-approved earlier stages of this project (Image 1 is the most recent — the design authority).`
      : "Image 1 is the client-approved design — the design authority.";
  if (kind.kind === "mockup") {
    return [
      "You are a brand-production checker.",
      approved,
      `The LAST image is a newly generated ${kind.stage}: the approved design shown in place on the real item, fixture or space.`,
      "Every printed surface / panel of the approved design must appear in the new image with exactly the approved artwork. For each surface you can see, compare it with the approved design:",
      COMMON_CHECKS,
      "- the imagery / illustration / photo used on each surface",
      "- if a printed surface shows a different design, different copy or a different logo treatment than approved, list it",
      "Ignore: the surrounding scene, room, props, products, people, camera angle, perspective, lighting, shadows, materials, and labels that sit OUTSIDE the artwork in the approved sheet (e.g. \"Header\", \"Side panel\") — those must NOT appear on the item.",
      GENERIC_REPLY_FORMAT,
    ].join("\n");
  }
  return [
    "You are a brand-production checker.",
    approved,
    `The LAST image is a newly generated ${kind.stage} that must carry the approved design over exactly — only the format, size or layout this stage needs may change.`,
    "Compare the new image with the approved design:",
    COMMON_CHECKS,
    "- the key imagery / illustration / characters and the overall art direction",
    "Ignore: changes of size, aspect ratio and re-layout that the new format requires, and tiny rendering differences inside fine patterns.",
    GENERIC_REPLY_FORMAT,
  ].join("\n");
}

type FidelityVerdict = { differences: string[]; approvedDesignMissing: boolean };

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

/** Parse the checker reply including the "design replaced" flag; null when unusable. */
function parseFidelityVerdict(raw: string): FidelityVerdict | null {
  const differences = parseFidelityDifferences(raw);
  if (!differences) return null;
  let missing = false;
  try {
    const text = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
    missing = (JSON.parse(text) as { approvedDesignMissing?: unknown }).approvedDesignMissing === true;
  } catch {
    missing = false;
  }
  return { differences, approvedDesignMissing: missing };
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
          // Thinking off: the check is a visual diff, and thinking added ~10–20 s.
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
): Promise<FidelityVerdict | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Fetched together — sequential downloads added seconds per image.
    const [output, ...fetched] = await Promise.all([
      toInline(candidate, controller.signal),
      ...approved.map((ref) => toInline(ref, controller.signal).catch(() => null)),
    ]);
    // ≤1024 px JPEGs: multi-MB PNG uploads were most of the check's time.
    const images = fetched
      .filter((img): img is InlineImage => img != null)
      .map((img) => downscaleForVision(img));
    if (images.length === 0 || !output) return null;
    images.push(downscaleForVision(output));
    const instruction = instructionFor(kind, images.length - 1);
    const attempts = [geminiAttempt(instruction, images), openAiAttempt(instruction, images)].filter(
      (a): a is Attempt => a != null,
    );
    for (const attempt of attempts) {
      try {
        const verdict = parseFidelityVerdict(await attempt(controller.signal));
        if (verdict) return verdict;
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
  const verdict = await findDifferences(kind, approved, firstImage);
  logFidelity("checked", {
    executionId,
    kind: kind.kind,
    approvedImages: approved.length,
    differences: verdict?.differences ?? null,
    approvedDesignMissing: verdict?.approvedDesignMissing ?? null,
  });
  if (!verdict || isCancelled()) return first;
  const differences = verdict.approvedDesignMissing
    ? [
        "The approved design is missing — it was replaced by a different design. Put the approved artwork from Image 1 onto every printed surface exactly as approved; change only what this stage needs.",
        ...verdict.differences,
      ].slice(0, MAX_DIFFERENCES)
    : verdict.differences;
  if (differences.length === 0) return first;

  const second = await dispatch(withFidelityCorrection(request, differences));
  const secondImage = second.ok ? firstOutputImage(second.value) : null;
  if (!second.ok || !secondImage) {
    logFidelity("correction_failed", { executionId, kind: kind.kind });
    return verdict.approvedDesignMissing ? withDeliveryNote(first) : first;
  }
  const remaining = await findDifferences(kind, approved, secondImage);
  const keepFirst =
    remaining !== null &&
    !verdict.approvedDesignMissing &&
    remaining.differences.length > differences.length;
  logFidelity("corrected", {
    executionId,
    kind: kind.kind,
    remaining: remaining?.differences ?? null,
    approvedDesignMissing: remaining?.approvedDesignMissing ?? null,
    kept: keepFirst ? "first" : "correction",
  });
  const chosen = keepFirst ? first : second;
  // Still not the approved design after one redraw: deliver it, but say so.
  return remaining?.approvedDesignMissing ? withDeliveryNote(chosen) : chosen;
}

function withDeliveryNote(
  result: Result<ProviderExecutionResponse>,
): Result<ProviderExecutionResponse> {
  if (!result.ok) return result;
  return {
    ...result,
    value: {
      ...result.value,
      output: { ...result.value.output, cdfDeliveryNote: CDF_DELIVERY_NOTE_FROM_BRIEF },
    },
  };
}
