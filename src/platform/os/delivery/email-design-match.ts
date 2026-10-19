/**
 * Build the final email HTML from the design the client approved.
 *
 * The emailer flow approves a designed email as an IMAGE (email-design /
 * responsive stages) before the final stage writes the HTML. The HTML step
 * used to see only the copy and brief, so it invented its own layout and the
 * delivered file looked nothing like the approved design.
 *
 * Here Claude is shown the approved design image(s) and rebuilds the HTML to
 * match them section by section. Photographic art in the design (product
 * shots, illustrations) is cropped out of the approved image itself and
 * published, so the email shows the same imagery. Any failure returns
 * undefined and the caller keeps the original HTML — export never blocks.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";
import AwsS3 from "../../../config/aws.config";
import type { EmailPlan } from "./email-generation";

const PUBLIC_BUCKET = "prakriadirect";
const PUBLIC_BUCKET_REGION = "ap-south-1";
const MAX_DESIGNS = 2;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CROPS = 6;

export type ApprovedEmailDesign = {
  readonly bytes: Buffer;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly phaseId?: string;
  readonly artifactId: string;
};

export type EmailDesignMatchConfig = {
  readonly model: string;
  readonly effort: "low" | "medium" | "high" | "xhigh" | "max";
  readonly timeoutMs: number;
};

export function emailDesignMatchConfigFromEnv(env = process.env): EmailDesignMatchConfig {
  const effort = (env.EMAIL_DESIGN_EFFORT ?? "").trim();
  const timeout = Number(env.EMAIL_DESIGN_TIMEOUT_MS);
  return {
    model: env.EMAIL_DESIGN_MODEL?.trim() || "claude-opus-5-5",
    effort:
      effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max"
        ? effort
        : "high",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 5 * 60_000,
  };
}

export function emailDesignMatchAvailable(env = process.env): boolean {
  if ((env.EMAIL_DESIGN_MATCH ?? "").trim().toLowerCase() === "off") return false;
  if ((env.ANTHROPIC_ENABLED ?? "true").trim().toLowerCase() === "false") return false;
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
}

// ── image helpers ──────────────────────────────────────────────────────────

function sniffMime(bytes: Buffer): "image/png" | "image/jpeg" | undefined {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return undefined;
}

function decodeRgba(
  bytes: Buffer,
  mimeType: "image/png" | "image/jpeg",
): { width: number; height: number; data: Buffer } {
  if (mimeType === "image/png") {
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: png.data };
  }
  const img = jpeg.decode(bytes, { useTArray: false, formatAsRGBA: true });
  return { width: img.width, height: img.height, data: Buffer.from(img.data) };
}

/** Crop a pixel box out of the design and encode it as JPEG. */
export function cropDesign(
  design: Pick<ApprovedEmailDesign, "bytes" | "mimeType">,
  box: { x: number; y: number; w: number; h: number },
): Buffer | undefined {
  const src = decodeRgba(design.bytes, design.mimeType);
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(src.width - x, Math.floor(box.w));
  const h = Math.min(src.height - y, Math.floor(box.h));
  if (!(w >= 24 && h >= 24)) return undefined;
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * src.width + x) * 4;
    src.data.copy(out, row * w * 4, from, from + w * 4);
  }
  return Buffer.from(jpeg.encode({ data: out, width: w, height: h }, 90).data);
}

async function publishCrop(input: {
  organizationId: string;
  executionId: string;
  id: string;
  bytes: Buffer;
}): Promise<string> {
  const safeId = input.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "image";
  const key = `email-design/${input.organizationId}/${input.executionId}/${safeId}.jpg`;
  await AwsS3.send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
      Body: input.bytes,
      ContentType: "image/jpeg",
      ACL: "public-read",
      CacheControl: "public, max-age=31536000",
    }),
  );
  return `https://${PUBLIC_BUCKET}.s3.${PUBLIC_BUCKET_REGION}.amazonaws.com/${key}`;
}

// ── approved design lookup ─────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Approved image stages of this CDF project, most recent stage first.
 * Sources: upstream visuals already bound to the request, then the session's
 * approved artifacts (earlier phases only).
 */
export async function loadApprovedEmailDesigns(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
}): Promise<ApprovedEmailDesign[]> {
  const meta = input.metadata ?? {};
  const refs: Array<{ artifactId: string; version: number; phaseId?: string }> = [];
  const seen = new Set<string>();
  const push = (artifactId: string, version: number, phaseId?: string) => {
    if (!artifactId.startsWith("cdfart_") || !Number.isInteger(version) || version < 1) return;
    if (seen.has(artifactId)) return;
    seen.add(artifactId);
    refs.push({ artifactId, version, ...(phaseId ? { phaseId } : {}) });
  };

  for (const a of Array.isArray(meta.assets) ? meta.assets : []) {
    const rec = a && typeof a === "object" ? (a as Record<string, unknown>) : undefined;
    if (!rec) continue;
    push(
      str(rec.cdfUpstreamArtifactId),
      Number(rec.cdfUpstreamArtifactVersion),
      str(rec.cdfUpstreamPhaseId) || undefined,
    );
  }

  const sessionId = str(meta.cdfSessionId);
  const serviceId = str(meta.cdfServiceId);
  const phaseId = str(meta.cdfPhaseId);
  if (sessionId) {
    const { ensureCdfSessionLoaded } = await import("../../cdf/session-store");
    const session = await ensureCdfSessionLoaded(sessionId).catch(() => undefined);
    const { resolveCdfCanonicalService } = await import("../../cdf/canonical");
    const phases = serviceId ? resolveCdfCanonicalService(serviceId)?.phases ?? [] : [];
    const order = new Map(phases.map((p, i) => [p.phaseId, i]));
    const current = phaseId ? order.get(phaseId) : undefined;
    const latestByPhase = new Map<string, { artifactId: string; version: number; phaseId: string }>();
    for (const ref of session?.approvedArtifacts ?? []) {
      if (ref.phaseId === phaseId) continue;
      const idx = order.get(ref.phaseId);
      if (current !== undefined && idx !== undefined && idx >= current) continue;
      const prev = latestByPhase.get(ref.phaseId);
      if (!prev || ref.version > prev.version) latestByPhase.set(ref.phaseId, ref);
    }
    [...latestByPhase.values()]
      .sort((a, b) => (order.get(b.phaseId) ?? -1) - (order.get(a.phaseId) ?? -1))
      .forEach((r) => push(r.artifactId, r.version, r.phaseId));
  }

  if (!refs.length) return [];
  const { ensureCdfArtifactBagLoaded, refreshCdfArtifactFromMongo } = await import(
    "../../cdf/artifacts/store"
  );
  await ensureCdfArtifactBagLoaded();
  const { getArtifactVersion } = await import("../../cdf/artifacts");
  const { extractVaultAssetIdFromArtifactData } = await import(
    "../../cdf/generation-context/canonical-visual-bytes"
  );
  const { getDefaultVaultAssetResolver } = await import(
    "../../cdf/rendering/default-vault-asset-resolver"
  );
  const resolver = getDefaultVaultAssetResolver();
  if (!resolver) return [];

  const designs: ApprovedEmailDesign[] = [];
  for (const ref of refs) {
    if (designs.length >= MAX_DESIGNS) break;
    try {
      await refreshCdfArtifactFromMongo(ref.artifactId);
      const version = getArtifactVersion(ref.artifactId, ref.version, {
        organizationId: input.organizationId,
      });
      const vaultAssetId = extractVaultAssetIdFromArtifactData(version.data);
      if (!vaultAssetId) continue; // text stage (copy, structure) — no image
      const raw = await resolver.resolve({ vaultAssetId, organizationId: input.organizationId });
      if (!raw || raw.byteLength === 0 || raw.byteLength > MAX_IMAGE_BYTES) continue;
      const bytes = Buffer.from(raw);
      const mimeType = sniffMime(bytes);
      if (!mimeType) continue;
      const { width, height } = decodeRgba(bytes, mimeType);
      designs.push({
        bytes,
        mimeType,
        width,
        height,
        artifactId: ref.artifactId,
        ...(ref.phaseId ? { phaseId: ref.phaseId } : {}),
      });
    } catch {
      // unreadable stage — try the next one
    }
  }
  return designs;
}

// ── HTML rebuild ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior email developer. You turn an approved email design (a picture) into send-ready HTML that looks the same when opened in an inbox.

Match the approved design exactly:
- Same sections in the same order, same background colours for each band, same layout (e.g. text left / image right in the hero, icon rows, pill buttons), same type hierarchy, weights, alignment and colours. Sample colours from the picture as hex.
- Use the copy the design shows. Where the design's text is garbled or unreadable (AI-generated lettering), use the matching line from the provided copy instead — never reproduce misspellings.
- If the picture shows a desktop layout and phone mock-ups, the desktop layout is the email at 600px; the phone mock-ups show how it stacks on mobile — reproduce that with a @media (max-width: 600px) block that stacks columns.

Email-safe rules:
- Table-based layout, inline CSS on every element, max width 600px, a <style> block only for the mobile media query. No <script>, no web fonts beyond a font stack, no CSS grid/flex for structure, no background images for essential content.
- Brand logo: <img src="logo.png" alt="BRAND logo" …> (it is replaced with the real logo file).
- Photographic or illustrated art in the design (product shots, splashes, patterned artwork, illustrations): crop it from the design image. Declare each crop in the CROPS block with pixel coordinates in that image and use src="{{CROP:id}}" in the HTML with width/height attributes and a descriptive alt. Crop tightly around the artwork; do not crop text, buttons or plain colour.
- Simple icons (sugar-free, recycle, social icons): crop each icon from the design via CROPS (many inboxes block inline SVG); use a Unicode symbol only when the icon is too small to crop.
- Links: use href="#" for every link.

Output format — exactly this, no markdown fences, no other text:
<<<CROPS>>>
[{"id":"hero","image":1,"x":0,"y":0,"w":0,"h":0}]
<<<HTML>>>
<!DOCTYPE html>…`;

export function parseDesignMatchResponse(raw: string): {
  crops: Array<{ id: string; image: number; x: number; y: number; w: number; h: number }>;
  html: string;
} {
  const text = raw.replace(/^```[a-z]*\n?|```\s*$/gim, "");
  const htmlIdx = text.indexOf("<<<HTML>>>");
  if (htmlIdx < 0) throw new Error("Email design response has no HTML block");
  const html = text.slice(htmlIdx + "<<<HTML>>>".length).trim();
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error("Email design response HTML is incomplete");
  }
  const cropsMatch = text.slice(0, htmlIdx).match(/<<<CROPS>>>\s*([\s\S]*)$/);
  let crops: Array<{ id: string; image: number; x: number; y: number; w: number; h: number }> = [];
  if (cropsMatch) {
    try {
      const parsed: unknown = JSON.parse(cropsMatch[1]!.trim() || "[]");
      if (Array.isArray(parsed)) {
        crops = parsed
          .map((c) => c as Record<string, unknown>)
          .filter((c) => typeof c.id === "string")
          .map((c) => ({
            id: String(c.id),
            image: Number(c.image) || 1,
            x: Number(c.x),
            y: Number(c.y),
            w: Number(c.w),
            h: Number(c.h),
          }))
          .filter((c) => [c.x, c.y, c.w, c.h].every(Number.isFinite))
          .slice(0, MAX_CROPS);
      }
    } catch {
      crops = [];
    }
  }
  return { crops, html };
}

function copyForPrompt(plan: EmailPlan, brandName?: string): string {
  return [
    brandName ? `BRAND: ${brandName}` : "",
    `SUBJECT: ${plan.subject}`,
    `PREHEADER: ${plan.preheader}`,
    `APPROVED COPY (plain text):\n${plan.textFallback.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  cachedClient ??= new Anthropic();
  return cachedClient;
}

/**
 * Rebuild the email HTML to match the approved design. Returns undefined when
 * there is no approved design or anything fails (caller keeps its HTML).
 */
export async function matchEmailToApprovedDesign(input: {
  readonly plan: EmailPlan;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly executionId: string;
  readonly brandName?: string;
  readonly config?: EmailDesignMatchConfig;
  /** Injectable for tests. */
  readonly loadDesigns?: typeof loadApprovedEmailDesigns;
  readonly callModel?: (content: Anthropic.Beta.BetaContentBlockParam[]) => Promise<string>;
  readonly publish?: typeof publishCrop;
}): Promise<{ html: string; designCount: number; cropCount: number } | undefined> {
  if (!input.callModel && !emailDesignMatchAvailable()) return undefined;
  const designs = await (input.loadDesigns ?? loadApprovedEmailDesigns)({
    metadata: input.metadata,
    organizationId: input.organizationId,
  });
  if (!designs.length) return undefined;

  const config = input.config ?? emailDesignMatchConfigFromEnv();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  designs.forEach((d, i) => {
    content.push({
      type: "text",
      text: `APPROVED DESIGN IMAGE ${i + 1}${d.phaseId ? ` (stage: ${d.phaseId})` : ""} — ${d.width}×${d.height}px. Crop coordinates refer to this image's pixels.`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: d.mimeType, data: d.bytes.toString("base64") },
    });
  });
  content.push({
    type: "text",
    text: `${copyForPrompt(input.plan, input.brandName)}\n\nBuild the email HTML that matches the approved design now.`,
  });

  const callModel =
    input.callModel ??
    (async (blocks: Anthropic.Beta.BetaContentBlockParam[]) => {
      const stream = client().beta.messages.stream(
        {
          model: config.model,
          max_tokens: 32_000,
          system: SYSTEM_PROMPT,
          thinking: { type: "adaptive" },
          output_config: { effort: config.effort },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          messages: [{ role: "user", content: blocks }],
        },
        { timeout: config.timeoutMs },
      );
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") throw new Error("Email designer declined the request");
      if (message.stop_reason === "max_tokens") throw new Error("Email designer ran out of output tokens");
      return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    });

  const parsed = parseDesignMatchResponse(await callModel(content));
  let html = parsed.html;
  const publish = input.publish ?? publishCrop;
  let cropCount = 0;
  for (const crop of parsed.crops) {
    const design = designs[crop.image - 1] ?? designs[0]!;
    let url: string | undefined;
    try {
      const bytes = cropDesign(design, crop);
      if (bytes) {
        url = await publish({
          organizationId: input.organizationId,
          executionId: input.executionId,
          id: crop.id,
          bytes,
        });
      }
    } catch {
      url = undefined;
    }
    if (url) cropCount += 1;
    // An unpublished crop keeps its alt text, so the image step can find a substitute.
    html = html.split(`{{CROP:${crop.id}}}`).join(url ?? "");
  }
  html = html.replace(/\{\{CROP:[^}]*\}\}/g, "");
  return { html, designCount: designs.length, cropCount };
}
