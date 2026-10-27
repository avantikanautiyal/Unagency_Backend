/**
 * Vendor image protocol — maps canonical image.generate to verified wire contracts.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ImageHttpRequest } from "../http/image-http-client";
import {
  planImageReferenceAdaptation,
  resolveCanonicalReferenceRoleWithSource,
  type ImageReferenceAdaptationPlan,
  type MultimodalReferenceRole,
} from "../../../ai/multimodal-context/reference-role";
import { adaptCanonicalReferenceForProvider } from "./adapt-provider-reference";

export interface VendorImageAuthContext {
  readonly apiKey?: string;
}

export interface VendorImageWirePlan {
  readonly request: ImageHttpRequest;
  /** Optional follow-up poll plan (BFL async). */
  readonly pollPathTemplate?: string;
  /**
   * Canonical reference-role adaptation (when refs present).
   * Preserves semantic meaning independently of wire field names.
   */
  readonly referenceAdaptation?: readonly ImageReferenceAdaptationPlan[];
  /** Forensic: canonical role vs vendor transport field. */
  readonly referenceRoleObservability?: Readonly<Record<string, unknown>>;
}

export interface VendorImageNormalizedResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly providerRequestId?: string;
}

export interface IVendorImageProtocol {
  readonly vendor: string;
  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean;
  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan;
  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult;
  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string;
}

export function resolveImageWireModelId(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/").slice(-1)[0] ?? modelId : modelId;
}

export function extractPrompt(payload: Readonly<Record<string, unknown>>): string {
  return String(payload.prompt ?? payload.text ?? payload.input ?? "").trim();
}

export type ReferenceImagePayload = {
  readonly mimeType: string;
  readonly base64?: string;
  readonly url?: string;
  /** Canonical why-attached role — independent of provider wire fields. */
  readonly semanticReferenceRole?: MultimodalReferenceRole;
  readonly referenceRoleResolutionSource?: string;
  readonly assetId?: string;
  /** Why the image is attached (e.g. an earlier stage's approved creative). */
  readonly relationshipLabel?: string;
  /** Project stage that produced this image, when it is an upstream creative. */
  readonly upstreamPhaseId?: string;
};

/** First image asset / image field on an image.generate payload (logo, reference still). */
export function extractReferenceImage(
  payload: Readonly<Record<string, unknown>>,
  requestMetadata?: Readonly<Record<string, unknown>>,
): ReferenceImagePayload | undefined {
  return extractReferenceImages(payload, requestMetadata)[0];
}

/** All image assets / image fields on a payload (multi-reference future). */
export function extractReferenceImages(
  payload: Readonly<Record<string, unknown>>,
  requestMetadata?: Readonly<Record<string, unknown>>,
): readonly ReferenceImagePayload[] {
  const candidates: unknown[] = [];
  if (payload.image) candidates.push(payload.image);
  if (Array.isArray(payload.assets)) candidates.push(...payload.assets);

  const out: ReferenceImagePayload[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const rec = candidate as Record<string, unknown>;
    const mimeType =
      typeof rec.mimeType === "string" && rec.mimeType.startsWith("image/")
        ? rec.mimeType
        : typeof rec.mime_type === "string" && rec.mime_type.startsWith("image/")
          ? rec.mime_type
          : undefined;
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    let resolved: ReferenceImagePayload | undefined;
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/i);
      if (match?.[1] && match[2]) {
        resolved = { mimeType: mimeType ?? match[1], base64: match[2], url };
      }
    } else {
      const b64 =
        typeof rec.base64 === "string"
          ? rec.base64
          : typeof rec.data === "string" && !String(rec.data).startsWith("http")
            ? rec.data
            : undefined;
      if (b64 && (mimeType || url.startsWith("http"))) {
        resolved = {
          mimeType: mimeType ?? "image/png",
          base64: b64,
          url: url || undefined,
        };
      } else if (url.startsWith("http") && (mimeType || !rec.mimeType)) {
        resolved = { mimeType: mimeType ?? "image/png", url };
      }
    }
    if (!resolved) continue;
    const key = resolved.base64?.slice(0, 64) || resolved.url || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const assetId =
      typeof rec.assetId === "string" && rec.assetId.trim()
        ? rec.assetId.trim()
        : undefined;
    const semanticResolved = resolveCanonicalReferenceRoleWithSource({
      explicitRole: rec.explicitRole,
      semanticReferenceRole: rec.semanticReferenceRole,
      referenceRole: rec.referenceRole,
      brandAssetRole: rec.brandAssetRole ?? rec.role,
      matchesAuthoritativeBrandLogoRelation: Boolean(
        assetId &&
          requestMetadata &&
          (requestMetadata.logoAssetId === assetId ||
            requestMetadata.brandLogoAssetId === assetId),
      ),
    });
    const semanticReferenceRole = semanticResolved.role;
    const resolutionSource =
      typeof rec.referenceRoleResolutionSource === "string"
        ? rec.referenceRoleResolutionSource
        : semanticResolved.source !== "absent"
          ? semanticResolved.source
          : undefined;
    const relationshipLabel =
      typeof rec.relationshipLabel === "string" && rec.relationshipLabel.trim()
        ? rec.relationshipLabel.trim()
        : undefined;
    const upstreamPhaseId =
      typeof rec.cdfUpstreamPhaseId === "string" && rec.cdfUpstreamPhaseId.trim()
        ? rec.cdfUpstreamPhaseId.trim()
        : undefined;
    out.push({
      ...resolved,
      ...(assetId ? { assetId } : {}),
      ...(relationshipLabel ? { relationshipLabel } : {}),
      ...(upstreamPhaseId ? { upstreamPhaseId } : {}),
      ...(semanticReferenceRole ? { semanticReferenceRole } : {}),
      ...(resolutionSource
        ? { referenceRoleResolutionSource: resolutionSource }
        : {}),
    });
  }
  return Object.freeze(out);
}

/** Data URL suitable for vendor JSON bodies (OpenAI edits, Recraft style refs). */
export function referenceImageToDataUrl(
  image: ReferenceImagePayload,
): string | undefined {
  if (image.url?.startsWith("data:")) return image.url;
  if (image.url?.startsWith("http")) return image.url;
  if (image.base64?.trim()) {
    return `data:${image.mimeType || "image/png"};base64,${image.base64.trim()}`;
  }
  return undefined;
}

/**
 * Apply role-preserving prompt guidance and return adaptation plans.
 * Only when a canonical semantic role is present — never invent a role.
 */
function wireAdaptationToPlan(
  wire: ReturnType<typeof adaptCanonicalReferenceForProvider>,
): ImageReferenceAdaptationPlan {
  return {
    canonicalRole: wire.canonicalRole,
    useStyleReferenceChannel:
      wire.providerSemanticMeaning === "style_transfer" &&
      wire.deliverBytes,
    deliverBytes: wire.deliverBytes,
    promptGuidance: wire.promptGuidance,
    wireFieldIsTransportOnly: wire.wireFieldIsTransportOnly,
    providerSemanticMeaning: wire.providerSemanticMeaning,
    referenceBehavior: wire.referenceBehavior,
    semanticPreservationOnWire: wire.semanticPreservationOnWire,
    mappingExplicitlyUnsupported: wire.mappingExplicitlyUnsupported,
  };
}

export function applyReferenceRolePromptGuidance(input: {
  readonly basePrompt: string;
  readonly references: readonly ReferenceImagePayload[];
}): {
  readonly prompt: string;
  readonly adaptations: readonly ImageReferenceAdaptationPlan[];
} {
  const adaptations: ImageReferenceAdaptationPlan[] = [];
  const guidanceBlocks: string[] = [];
  for (const ref of input.references) {
    const role = ref.semanticReferenceRole;
    if (!role) continue;
    const plan = planImageReferenceAdaptation(role);
    adaptations.push(plan);
    if (!input.basePrompt.includes(`REFERENCE ROLE = ${plan.canonicalRole}`)) {
      guidanceBlocks.push(plan.promptGuidance);
    }
  }
  const prompt =
    guidanceBlocks.length > 0
      ? `${input.basePrompt.trim()}\n\n${guidanceBlocks.join("\n")}`.trim()
      : input.basePrompt.trim();
  return { prompt, adaptations: Object.freeze(adaptations) };
}

/**
 * Provider-boundary reference adaptation — uses capability registry per vendor.
 */
export function applyProviderReferenceAdaptations(input: {
  readonly basePrompt: string;
  readonly references: readonly ReferenceImagePayload[];
  readonly vendor: string;
}): {
  readonly prompt: string;
  readonly adaptations: readonly ImageReferenceAdaptationPlan[];
} {
  const adaptations: ImageReferenceAdaptationPlan[] = [];
  const guidanceBlocks: string[] = [];
  for (const ref of input.references) {
    const role = ref.semanticReferenceRole;
    if (!role) continue;
    const wire = adaptCanonicalReferenceForProvider({
      vendor: input.vendor,
      role,
    });
    const plan = wireAdaptationToPlan(wire);
    adaptations.push(plan);
    if (!input.basePrompt.includes(`REFERENCE ROLE = ${plan.canonicalRole}`)) {
      guidanceBlocks.push(plan.promptGuidance);
    }
  }
  const prompt =
    guidanceBlocks.length > 0
      ? `${input.basePrompt.trim()}\n\n${guidanceBlocks.join("\n")}`.trim()
      : input.basePrompt.trim();
  return { prompt, adaptations: Object.freeze(adaptations) };
}

const USER_SELECTED_RELATIONSHIP = "user_selected_generation_reference";
const UPSTREAM_STAGE_RELATIONSHIP = "cdf_upstream_visual_artifact";

function continuityRank(ref: ReferenceImagePayload): number {
  if (ref.relationshipLabel === USER_SELECTED_RELATIONSHIP) return 0;
  if (ref.relationshipLabel === UPSTREAM_STAGE_RELATIONSHIP) return 1;
  if (ref.semanticReferenceRole === "identity_mark") return 3;
  return 2;
}

/** An approved creative of this project (selected or signed-off stage), not a logo/product/style ref. */
export function isApprovedDesignReference(ref: ReferenceImagePayload): boolean {
  return continuityRank(ref) <= 1;
}

/**
 * Order references so the creative being continued comes first and the brand
 * mark last. Vendors that weight (or only read) the first image used to get
 * the logo alone — every downstream stage then re-invented the design.
 * Stable within a rank: upstream stages keep the order they were attached in.
 */
export function orderReferencesForContinuity(
  refs: readonly ReferenceImagePayload[],
): ReferenceImagePayload[] {
  return refs
    .map((ref, index) => ({ ref, index }))
    .sort((a, b) => continuityRank(a.ref) - continuityRank(b.ref) || a.index - b.index)
    .map(({ ref }) => ref);
}

function humanStage(phaseId: string | undefined): string {
  return phaseId ? phaseId.replace(/[-_]+/g, " ") : "earlier";
}

/**
 * True when this request is one of several alternative options (model fanout,
 * "3 routes"), where varying within the approved design is wanted. Parts of
 * one deliverable (brochure pages) and single follow-on stages are not options.
 */
export function requestIsOneOfSeveralOptions(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata || metadata.cdfPageDocumentPart === true) return false;
  if (typeof metadata.generationFanoutTargetId === "string" && metadata.generationFanoutTargetId) {
    return true;
  }
  const count = metadata.creativeOptionCount;
  return typeof count === "number" && count > 1;
}

/**
 * True when this request edits a creative the user asked to refine. The
 * refine instruction must win over "reproduce exactly" — otherwise the model
 * faithfully redraws the approved image and ignores the change.
 */
export function requestIsRefinement(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;
  if (metadata.cdfRefineSource === true) return true;
  return typeof metadata.refinePrompt === "string" && metadata.refinePrompt.trim().length > 0;
}

/** "Generate Angles": the approved pack re-rendered from another viewpoint. */
export function requestIsNewViewpoint(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return typeof metadata?.cdfPackAngle === "string" && metadata.cdfPackAngle.trim().length > 0;
}

/**
 * What a follow-on stage does with the approved design it continues from.
 * - placement: the approved flat artwork physically produced and shown in
 *   place (store mockup, merch product mockup, print/OOH mockup)
 * - detailing: the approved composition finished (final illustration)
 * - logo_system: the approved logo laid out as a usage sheet
 * - continuation: anything else built from an approved image (adaptations,
 *   production creative)
 */
export type ApprovedStageMode = "placement" | "detailing" | "logo_system" | "continuation";

const STAGE_MODE_BY_ARTIFACT_KEY: Readonly<Record<string, ApprovedStageMode>> = {
  "store-display.store-mockup": "placement",
  "merchandise.product-mockup": "placement",
  "print-ooh.mockup": "placement",
  "illustration.final-illustration": "detailing",
  "logo.logo-system": "logo_system",
};

export function approvedStageMode(
  metadata: Readonly<Record<string, unknown>> | undefined,
): ApprovedStageMode {
  const key = typeof metadata?.cdfArtifactKey === "string" ? metadata.cdfArtifactKey.trim() : "";
  return STAGE_MODE_BY_ARTIFACT_KEY[key] ?? "continuation";
}

function stageModeLine(mode: ApprovedStageMode, authority: number): string | null {
  if (mode === "placement") {
    return `PLACEMENT: Image ${authority} is the approved flat print artwork (the printed panels of the unit, or the print file). This stage shows exactly that artwork physically produced and in place: every panel and graphic of Image ${authority} is the printed surface of the unit / item / site — the same artwork, every word of copy, colours and logo placement — clearly visible and facing the camera so the client recognises it at a glance. Build the setting around it (store, fixtures, products, lighting) from the brief and the brand, but put no other artwork, copy or logo on the unit, never redesign it, and never show the small panel labels of the flat sheet. Where the brief and Image ${authority} disagree about what is printed, Image ${authority} wins.`;
  }
  if (mode === "detailing") {
    return `FINAL DETAILING: keep Image ${authority}'s composition exactly — the same subjects, poses, layout, perspective, framing and palette. Add only finish, detail, texture and polish; never move, add or remove elements.`;
  }
  if (mode === "logo_system") {
    return `LOGO SYSTEM: every logo on the sheet is exactly the approved logo in Image ${authority} — the same mark, letterforms, proportions and colours. Show only the variants, sizes and clear-space the guidelines need; never redraw it.`;
  }
  return null;
}

/**
 * Tell the model what each attached image is, in attachment order. Only
 * emitted when an upstream creative is attached (otherwise role guidance
 * already covers a lone logo / reference).
 *
 * Approved stages are sign-offs, not inspiration: a follow-on stage (3D pack →
 * flat 2D pack, master → adaptation) must reproduce them exactly. Only a set
 * of alternative options may vary — and even then never the artwork or copy.
 */
export function describeReferenceImages(
  refs: readonly ReferenceImagePayload[],
  options: {
    readonly oneOfSeveralOptions?: boolean;
    /** Refine run: apply the requested change on top of the approved design. */
    readonly refinement?: boolean;
    /** Same approved pack, new camera angle (wins over refinement). */
    readonly newViewpoint?: boolean;
    /** What this follow-on stage does with the approved design. */
    readonly stageMode?: ApprovedStageMode;
  } = {},
): string {
  const hasUpstream = refs.some((ref) => continuityRank(ref) <= 1);
  if (!hasUpstream || refs.length === 0) return "";
  const authority = refs.findIndex((ref) => continuityRank(ref) <= 1) + 1;
  const lines = refs.map((ref, i) => {
    const n = i + 1;
    if (ref.relationshipLabel === USER_SELECTED_RELATIONSHIP) {
      return `Image ${n}: the creative the user selected to continue from — its design is approved.`;
    }
    if (ref.relationshipLabel === UPSTREAM_STAGE_RELATIONSHIP) {
      return `Image ${n}: the approved ${humanStage(ref.upstreamPhaseId)} stage output — signed off by the client.`;
    }
    if (ref.semanticReferenceRole === "identity_mark") {
      return `Image ${n}: the brand logo — reproduce it exactly as provided; do not redraw, restyle or reinterpret it.`;
    }
    if (ref.semanticReferenceRole === "product_reference") {
      return `Image ${n}: the client's actual product, photographed — the item this creative is about.`;
    }
    return `Image ${n}: supporting reference.`;
  });
  const productImages = refs
    .map((ref, i) => (ref.semanticReferenceRole === "product_reference" ? i + 1 : 0))
    .filter(Boolean);
  const modeLine =
    options.refinement || options.newViewpoint || options.oneOfSeveralOptions
      ? null
      : stageModeLine(options.stageMode ?? "continuation", authority);
  return [
    "REFERENCE IMAGES (in the order attached):",
    ...lines,
    ...(productImages.length
      ? [
          `PRODUCT AUTHORITY: the product shown must be exactly the item in Image ${productImages.join(" / Image ")} — same type, shape, material, colour and every design detail. Never substitute another product, even if an approved image shows a different one.`,
        ]
      : []),
    `DESIGN AUTHORITY: Image ${authority} is the approved design. Reproduce it exactly — the same artwork, illustrations and characters, every word of on-pack/on-page copy, colours, typography, graphic devices, and the logo and its placement. If approved images differ, Image ${authority} wins. Where the written brief differs from the approved images, follow the images.`,
    options.newViewpoint
      ? "NEW VIEWPOINT: this is the same approved physical pack seen from another angle. Take its shape, proportions, construction, material and finish from the approved 3D pack; take the artwork of every panel — every word, its order and line breaks, logo placement, colour bands and patterns — from the approved flat 2D pack sheet, panel by panel. Change only the camera viewpoint; never invent, move or reword anything on any panel."
      : options.refinement
      ? "REFINEMENT: the user asked for a specific change to this design. Apply that change fully and visibly — it overrides the approved images and the brief wherever they conflict. Keep everything the change does not touch exactly as it is."
      : options.oneOfSeveralOptions
      ? "Several options are being made: vary only the presentation (angle, framing, staging, background) — never the approved artwork, copy or colours."
      : modeLine
      ? modeLine
      : "Change only what this stage's deliverable requires (e.g. unfold or unroll the approved 3D pack into its own flat print layout — the same pack type, never an outer box it was not shown in — re-lay the design for a new size, extend it onto panels the earlier view did not show — in the same design). Do not redesign, restyle, or add artwork or copy beyond what the deliverable needs.",
  ].join("\n");
}
