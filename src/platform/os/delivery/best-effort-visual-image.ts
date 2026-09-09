/**
 * Best-effort image.generate for presentation slides / website heroes.
 * Never throws into export — returns undefined on any failure.
 * When a brand logo reference is available, prefer reference-capable providers
 * and attach the mark on the wire so heroes/slides reuse the vault logo.
 *
 * Phase 1: this path is NEVER production-release eligible. Optional Spec
 * metadata may still be injected into the prompt for craft alignment, but
 * outputs must not be treated as PASS under Format & Production Spec gates.
 */

import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../core/identifiers";
import { listImageMediaOutputs } from "../../api/services/sync-image-artifact-materializer";
import type { ImageExecutionRouter } from "../../providers/image/routing/image-execution-router";
import type { IProviderRuntimeRegistry } from "../../providers/runtime/registry/in-memory-provider-runtime-registry";
import { UNCANCELLED_TOKEN } from "../../providers/runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../providers/runtime/contracts/provider-execution-request";
import {
  capabilityProfileForProvider,
  listReferenceImageProviderIds,
} from "../../providers/image/configs/image-provider-capabilities";
import { ensureProviderPromptHasProductionSpec } from "../../config/format-production-spec";

/** Soft-path marker — delivery auth must not treat these as Spec PASS. */
export const BEST_EFFORT_VISUAL_PRODUCTION_ELIGIBLE = false as const;

export type VisualImageBytes = {
  readonly base64: string;
  readonly mimeType: string;
  /** Always false for best-effort visuals (Phase 1 soft path). */
  readonly productionReleaseEligible?: false;
};

export type BestEffortVisualImageDeps = {
  readonly imageRouter?: ImageExecutionRouter;
  readonly registry?: IProviderRuntimeRegistry;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly executionId?: string;
};

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "png";
}

function extractBase64FromDataUrl(url: string): string | undefined {
  const marker = ";base64,";
  const idx = url.indexOf(marker);
  if (!url.startsWith("data:") || idx < 0) return undefined;
  const raw = url.slice(idx + marker.length).trim();
  return raw || undefined;
}

/** Resolve logo bytes from hydrated execution metadata (image / assets). */
export function extractReferenceLogoFromMetadata(
  metadata?: Readonly<Record<string, unknown>>
): VisualImageBytes | undefined {
  if (!metadata) return undefined;
  const candidates: unknown[] = [];
  if (metadata.image) candidates.push(metadata.image);
  if (Array.isArray(metadata.assets)) candidates.push(...metadata.assets);

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
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/i);
      if (match?.[1] && match[2]) {
        return { mimeType: mimeType ?? match[1], base64: match[2] };
      }
    }
    const b64 =
      typeof rec.base64 === "string"
        ? rec.base64
        : typeof rec.data === "string" && !String(rec.data).startsWith("http")
          ? rec.data
          : undefined;
    if (b64) {
      return { mimeType: mimeType ?? "image/png", base64: b64 };
    }
  }
  return undefined;
}

function buildImagePrompt(input: {
  prompt: string;
  brandColors?: readonly string[];
  hasReferenceLogo?: boolean;
  productionMetadata?: Readonly<Record<string, unknown>>;
}): string {
  const cue = input.prompt.trim();
  if (!cue) return "";
  const palette =
    input.brandColors?.filter((c) => typeof c === "string" && c.trim()).slice(0, 5) ??
    [];
  const parts = [
    cue,
    "High-quality presentation/website visual, photoreal or polished design graphic, no watermarks, no text overlays unless essential.",
    "SOFT PATH: supporting visual only — not an approved production release master.",
  ];
  if (input.hasReferenceLogo) {
    parts.push(
      "A brand logo/reference mark is attached — reproduce it faithfully; do not invent a different logo."
    );
  }
  if (palette.length) {
    parts.push(`Colour palette emphasis: ${palette.join(", ")}.`);
  }
  let prompt = parts.join(" ");
  if (input.productionMetadata) {
    prompt = ensureProviderPromptHasProductionSpec({
      prompt,
      metadata: input.productionMetadata,
    }).prompt;
  }
  return prompt;
}

/**
 * Resolve one image via LIVE image.generate providers. Returns undefined on miss/fail.
 * Always soft-path: productionReleaseEligible is false.
 */
export async function generateBestEffortVisualImage(input: {
  readonly prompt: string;
  readonly brandColors?: readonly string[];
  readonly referenceLogo?: VisualImageBytes;
  readonly deps?: BestEffortVisualImageDeps;
  /** Optional service/platform metadata so Spec can shape the soft-path prompt. */
  readonly productionMetadata?: Readonly<Record<string, unknown>>;
}): Promise<VisualImageBytes | undefined> {
  try {
    const hasReferenceLogo = Boolean(input.referenceLogo?.base64?.trim());
    const prompt = buildImagePrompt({
      prompt: input.prompt,
      brandColors: input.brandColors,
      hasReferenceLogo,
      productionMetadata: input.productionMetadata,
    });
    if (!prompt) return undefined;

    const deps = input.deps;
    const imageRouter = deps?.imageRouter;
    const registry = deps?.registry;
    if (!imageRouter || !registry) return undefined;

    const referenceCapable = new Set(listReferenceImageProviderIds());
    let preferredProviderId: string | undefined;
    if (hasReferenceLogo) {
      for (const providerId of referenceCapable) {
        if (registry.resolveAvailable(asProviderId(providerId))?.dispatcher) {
          preferredProviderId = providerId;
          break;
        }
      }
    }

    const routed = imageRouter.resolve({
      prompt,
      capabilityId: "image.generate",
      ...(preferredProviderId ? { preferredProviderId } : {}),
    });
    if (!routed.ok) {
      console.warn(
        `[best-effort-visual] image route failed: ${routed.error.message}`
      );
      return undefined;
    }

    // When a logo is bound, skip providers that cannot accept a reference image.
    let providerId = routed.value.providerId;
    let modelId = routed.value.modelId;
    if (hasReferenceLogo) {
      const profile = capabilityProfileForProvider(providerId);
      if (!profile?.supportsReferenceImage) {
        const failover =
          routed.value.failoverChain.find((step) =>
            referenceCapable.has(step.providerId)
          ) ??
          [...referenceCapable]
            .map((id) => ({ providerId: id, modelId: "default" }))
            .find((step) => registry.resolveAvailable(asProviderId(step.providerId))?.dispatcher);
        if (failover) {
          providerId = failover.providerId;
          modelId = failover.modelId;
        }
      }
    }

    const entry = registry.resolveAvailable(asProviderId(providerId));
    if (!entry?.dispatcher) {
      console.warn(
        `[best-effort-visual] no executable dispatcher for ${providerId}`
      );
      return undefined;
    }

    const createId = deps.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const nowIso = deps.nowIso ?? (() => new Date().toISOString());
    const executionId = deps.executionId?.trim() || createId("visual");
    const organizationId = deps.organizationId?.trim() || "org_visual";
    const workspaceId = deps.workspaceId?.trim() || "ws_visual";

    const referencePayload =
      hasReferenceLogo && input.referenceLogo
        ? {
            image: {
              mimeType: input.referenceLogo.mimeType,
              base64: input.referenceLogo.base64,
            },
          }
        : {};

    const request: ProviderExecutionRequest = {
      requestId: createId("visimg"),
      context: {
        executionId: asExecutionId(executionId),
        organizationId: asOrganizationId(organizationId),
        workspaceId: asWorkspaceId(workspaceId),
        providerId: asProviderId(providerId),
        correlationId: executionId,
      },
      capabilityId: asCapabilityId("image.generate"),
      providerId: asProviderId(providerId),
      modelId,
      payload: { prompt, ...referencePayload },
      retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
      timeoutPolicy: { executionTimeoutMs: 90_000 },
      streaming: false,
      priority: 0,
      createdAt: nowIso(),
    };

    const dispatched = await entry.dispatcher.dispatch(
      request,
      UNCANCELLED_TOKEN
    );
    if (!dispatched.ok) {
      console.warn(
        `[best-effort-visual] dispatch failed: ${dispatched.error.message}`
      );
      return undefined;
    }

    const images = listImageMediaOutputs(dispatched.value.output);
    const first = images[0];
    if (!first) return undefined;

    const fromField =
      typeof first.base64 === "string" && first.base64.trim()
        ? first.base64.trim()
        : undefined;
    const fromDataUrl =
      typeof first.url === "string" ? extractBase64FromDataUrl(first.url) : undefined;
    const base64 = fromField ?? fromDataUrl;
    if (!base64) {
      // HTTPS URL without bytes — skip (PPTX needs embedded data)
      console.warn("[best-effort-visual] image had URL only, no base64 — skipped");
      return undefined;
    }

    return {
      base64,
      mimeType: first.mimeType?.trim() || "image/png",
      productionReleaseEligible: BEST_EFFORT_VISUAL_PRODUCTION_ELIGIBLE,
    };
  } catch (err) {
    console.warn(
      `[best-effort-visual] unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

/** Run async work with a max concurrency limit. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    runOne()
  );
  await Promise.all(runners);
  return results;
}

export type SlideImageResolveResult = {
  readonly data: string;
  readonly ext?: string;
};

/**
 * Build a PresentationExportOptions.resolveSlideImage callback from visual deps.
 */
export function createSlideImageResolver(
  deps: BestEffortVisualImageDeps | undefined,
  brandColors?: readonly string[],
  referenceLogo?: VisualImageBytes
):
  | ((
      cue: string
    ) => Promise<SlideImageResolveResult | undefined>)
  | undefined {
  if (!deps?.imageRouter || !deps?.registry) return undefined;
  return async (cue: string) => {
    const image = await generateBestEffortVisualImage({
      prompt: cue,
      brandColors,
      referenceLogo,
      deps,
    });
    if (!image) return undefined;
    return {
      data: image.base64,
      ext: mimeToExt(image.mimeType),
    };
  };
}

export function toDataUrl(image: VisualImageBytes): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}
