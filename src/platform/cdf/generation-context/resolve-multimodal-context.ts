/**
 * Phase 9 — CDF adapter: resolve multimodal context for canonical generation.
 * No S3/DB lookups here. Uses already-authorized metadata + conversation messages.
 */

import {
  projectMultimodalForProvider,
  resolveCanonicalReferenceRoleWithSource,
  selectMultimodalContext,
  summarizeMultimodalForTrace,
  type MultimodalContext,
  type MultimodalInputDescriptor,
  type MultimodalProviderProjection,
  type MultimodalReferenceRole,
} from "../../ai/multimodal-context";
import type { WorkingMemorySourceMessage } from "../../ai/conversation-working-memory";
import type { GenerationReferenceResolutionResult } from "../../ai/reference-resolution";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function metadataLogoAssetIds(
  metadata: Readonly<Record<string, unknown>>,
): Set<string> {
  const ids = new Set<string>();
  for (const key of ["logoAssetId", "brandLogoAssetId"] as const) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) ids.add(v.trim());
  }
  return ids;
}

function roleFromRecord(
  rec: Record<string, unknown>,
  metadata?: Readonly<Record<string, unknown>>,
): {
  role?: MultimodalReferenceRole;
  source?: string;
} {
  const assetId =
    typeof rec.assetId === "string" && rec.assetId.trim()
      ? rec.assetId.trim()
      : typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim()
        : undefined;
  const logoIds = metadata ? metadataLogoAssetIds(metadata) : new Set<string>();
  const resolved = resolveCanonicalReferenceRoleWithSource({
    explicitRole: rec.explicitRole,
    semanticReferenceRole: rec.semanticReferenceRole,
    referenceRole: rec.referenceRole,
    brandAssetRole: rec.brandAssetRole ?? rec.role,
    matchesAuthoritativeBrandLogoRelation: Boolean(
      assetId && logoIds.has(assetId),
    ),
  });
  return {
    ...(resolved.role ? { role: resolved.role } : {}),
    ...(resolved.source !== "absent" ? { source: resolved.source } : {}),
  };
}

function pushUnique(
  out: MultimodalInputDescriptor[],
  seen: Set<string>,
  d: MultimodalInputDescriptor,
): void {
  const key =
    d.assetId?.trim() ||
    d.attachmentId?.trim() ||
    `${d.messageId ?? ""}:${d.filename ?? ""}:${d.mimeType ?? ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(d);
}

/** Collect descriptors from execution metadata (ProductAsset bridge already ran). */
export function descriptorsFromExecutionMetadata(
  metadata: Readonly<Record<string, unknown>>,
  organizationId?: string,
): MultimodalInputDescriptor[] {
  const out: MultimodalInputDescriptor[] = [];
  const seen = new Set<string>();

  const assets = Array.isArray(metadata.assets) ? metadata.assets : [];
  for (const a of assets) {
    const rec = asRecord(a);
    if (!rec) continue;
    const mime =
      typeof rec.mimeType === "string" ? rec.mimeType : "application/octet-stream";
    const assetId =
      typeof rec.assetId === "string"
        ? rec.assetId
        : typeof rec.id === "string"
          ? rec.id
          : undefined;
    const semantic = roleFromRecord(rec, metadata);
    pushUnique(out, seen, {
      sourceType: "product_asset",
      mimeType: mime,
      filename:
        typeof rec.filename === "string"
          ? rec.filename
          : typeof rec.fileName === "string"
            ? rec.fileName
            : undefined,
      assetId,
      organizationId:
        typeof rec.organizationId === "string"
          ? rec.organizationId
          : organizationId,
      url: typeof rec.url === "string" ? rec.url : undefined,
      storageRef:
        typeof rec.storageRef === "string" ? rec.storageRef : undefined,
      sizeBytes:
        typeof rec.sizeBytes === "number"
          ? rec.sizeBytes
          : typeof rec.size === "number"
            ? rec.size
            : undefined,
      extractedText:
        typeof rec.extractedText === "string" ? rec.extractedText : undefined,
      hasVisualProviderRef: Boolean(rec.url || rec.storageRef),
      relationshipLabel: "execution_product_asset",
      ...(semantic.role ? { semanticReferenceRole: semantic.role } : {}),
      ...(semantic.source
        ? {
            referenceRoleResolutionSource:
              semantic.source as MultimodalInputDescriptor["referenceRoleResolutionSource"],
          }
        : {}),
      provenance: ["metadata.assets", "product_asset_input_bridge"],
    });
  }

  const image = asRecord(metadata.image);
  if (image) {
    const semantic = roleFromRecord(image, metadata);
    pushUnique(out, seen, {
      sourceType: "product_asset",
      mimeType:
        typeof image.mimeType === "string" ? image.mimeType : "image/png",
      assetId:
        typeof image.assetId === "string" ? image.assetId : undefined,
      organizationId:
        typeof image.organizationId === "string"
          ? image.organizationId
          : organizationId,
      url: typeof image.url === "string" ? image.url : undefined,
      storageRef:
        typeof image.storageRef === "string" ? image.storageRef : undefined,
      hasVisualProviderRef: Boolean(image.url || image.storageRef),
      relationshipLabel: "execution_primary_image",
      ...(semantic.role ? { semanticReferenceRole: semantic.role } : {}),
      ...(semantic.source
        ? {
            referenceRoleResolutionSource:
              semantic.source as MultimodalInputDescriptor["referenceRoleResolutionSource"],
          }
        : {}),
      provenance: ["metadata.image"],
    });
  }

  // Explicit descriptors (tests / callers) — never invented from free text.
  const explicit = Array.isArray(metadata.multimodalAttachments)
    ? metadata.multimodalAttachments
    : Array.isArray(metadata.attachments)
      ? metadata.attachments
      : [];
  for (const raw of explicit) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const semantic = roleFromRecord(rec, metadata);
    pushUnique(out, seen, {
      sourceType: "explicit_descriptor",
      mimeType:
        typeof rec.mimeType === "string"
          ? rec.mimeType
          : "application/octet-stream",
      filename:
        typeof rec.filename === "string"
          ? rec.filename
          : typeof rec.fileName === "string"
            ? rec.fileName
            : undefined,
      assetId: typeof rec.assetId === "string" ? rec.assetId : undefined,
      attachmentId:
        typeof rec.attachmentId === "string" ? rec.attachmentId : undefined,
      messageId: typeof rec.messageId === "string" ? rec.messageId : undefined,
      conversationId:
        typeof rec.conversationId === "string"
          ? rec.conversationId
          : undefined,
      organizationId:
        typeof rec.organizationId === "string"
          ? rec.organizationId
          : organizationId,
      url: typeof rec.url === "string" ? rec.url : undefined,
      storageRef:
        typeof rec.storageRef === "string" ? rec.storageRef : undefined,
      sizeBytes:
        typeof rec.sizeBytes === "number" ? rec.sizeBytes : undefined,
      extractedText:
        typeof rec.extractedText === "string" ? rec.extractedText : undefined,
      hasVisualProviderRef: Boolean(
        rec.hasVisualProviderRef === true || rec.url || rec.storageRef,
      ),
      relationshipLabel:
        typeof rec.relationshipLabel === "string"
          ? rec.relationshipLabel
          : "explicit_attachment",
      ...(semantic.role ? { semanticReferenceRole: semantic.role } : {}),
      ...(semantic.source
        ? {
            referenceRoleResolutionSource:
              semantic.source as MultimodalInputDescriptor["referenceRoleResolutionSource"],
          }
        : {}),
      provenance: ["metadata.multimodalAttachments"],
    });
  }

  // extractedTexts map: assetId → text (from existing indexing, if caller provided)
  const extractedMap = asRecord(metadata.extractedTexts);
  if (!extractedMap) return out;
  return out.map((d) => {
    if (d.assetId && typeof extractedMap[d.assetId] === "string" && !d.extractedText) {
      return { ...d, extractedText: String(extractedMap[d.assetId]) };
    }
    return d;
  });
}

/** Chat / message attachments already loaded for this authorized conversation. */
export function descriptorsFromConversationMessages(
  messages: readonly WorkingMemorySourceMessage[] | undefined,
  organizationId?: string,
): MultimodalInputDescriptor[] {
  if (!messages?.length) return [];
  const out: MultimodalInputDescriptor[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
    for (const a of atts) {
      const rec = asRecord(a) ?? (a as unknown as Record<string, unknown>);
      if (!rec || typeof rec !== "object") continue;
      const mime =
        typeof rec.mimeType === "string"
          ? rec.mimeType
          : "application/octet-stream";
      pushUnique(out, seen, {
        sourceType:
          typeof rec.assetId === "string"
            ? "message_attachment"
            : "chat_attachment",
        mimeType: mime,
        filename:
          typeof rec.filename === "string"
            ? rec.filename
            : typeof rec.fileName === "string"
              ? rec.fileName
              : undefined,
        assetId: typeof rec.assetId === "string" ? rec.assetId : undefined,
        attachmentId:
          typeof rec.attachmentId === "string"
            ? rec.attachmentId
            : undefined,
        messageId: msg.id,
        conversationId: msg.conversationId,
        organizationId,
        url: typeof rec.url === "string" ? rec.url : undefined,
        sizeBytes:
          typeof rec.sizeBytes === "number"
            ? rec.sizeBytes
            : typeof rec.size === "number"
              ? rec.size
              : undefined,
        extractedText:
          typeof rec.extractedText === "string"
            ? rec.extractedText
            : undefined,
        hasVisualProviderRef: Boolean(
          (typeof rec.url === "string" && mime.startsWith("image/")) ||
            rec.assetId,
        ),
        relationshipLabel: "conversation_message_attachment",
        provenance: ["conversation_message", `message:${msg.id}`],
      });
    }
  }
  return out;
}

/**
 * Phase 6: if a deterministic reference already names an attachment/asset id
 * present in descriptors, ensure it is included (no invention).
 */
export function ensureReferencedAttachments(input: {
  descriptors: MultimodalInputDescriptor[];
  referenceResolution?: GenerationReferenceResolutionResult;
}): MultimodalInputDescriptor[] {
  const refs = input.referenceResolution?.references ?? [];
  if (!refs.length) return input.descriptors;
  // References that already carry artifactId are CDF artifacts — not attachments.
  // Attachment linkage only when provenance mentions attachment/asset metadata.
  const wanted = new Set<string>();
  for (const r of refs) {
    if (r.status !== "exact" && r.status !== "deterministic") continue;
    if (r.artifactId) continue; // ArtifactVersion path — Phase 8
    for (const p of r.provenance ?? []) {
      if (p.startsWith("asset:") || p.startsWith("attachment:")) {
        wanted.add(p.slice(p.indexOf(":") + 1));
      }
    }
  }
  if (!wanted.size) return input.descriptors;
  // Descriptors already contain authorized set; filter nothing in — just verify presence.
  return input.descriptors;
}

export function resolveCanonicalMultimodalContext(input: {
  metadata: Readonly<Record<string, unknown>>;
  conversationMessages?: readonly WorkingMemorySourceMessage[];
  organizationId?: string;
  referenceResolution?: GenerationReferenceResolutionResult;
}): MultimodalContext {
  const fromMeta = descriptorsFromExecutionMetadata(
    input.metadata,
    input.organizationId,
  );
  const fromChat = descriptorsFromConversationMessages(
    input.conversationMessages,
    input.organizationId,
  );
  const merged = ensureReferencedAttachments({
    descriptors: [...fromMeta, ...fromChat],
    referenceResolution: input.referenceResolution,
  });
  return selectMultimodalContext({
    descriptors: merged,
    organizationId: input.organizationId,
  });
}

export function projectCanonicalMultimodalForProviders(input: {
  context: MultimodalContext;
  metadata: Readonly<Record<string, unknown>>;
}): MultimodalProviderProjection {
  const assets = Array.isArray(input.metadata.assets)
    ? input.metadata.assets
    : [];
  const image = input.metadata.image;
  const visualAssets: Array<{
    url?: string;
    storageRef?: string;
    mimeType?: string;
    organizationId?: string;
    assetId?: string;
  }> = [];
  for (const a of assets) {
    const rec = asRecord(a);
    if (!rec) continue;
    visualAssets.push({
      url: typeof rec.url === "string" ? rec.url : undefined,
      storageRef:
        typeof rec.storageRef === "string" ? rec.storageRef : undefined,
      mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
      organizationId:
        typeof rec.organizationId === "string"
          ? rec.organizationId
          : undefined,
      assetId:
        typeof rec.assetId === "string"
          ? rec.assetId
          : typeof rec.id === "string"
            ? rec.id
            : undefined,
    });
  }
  const img = asRecord(image);
  if (img) {
    visualAssets.push({
      url: typeof img.url === "string" ? img.url : undefined,
      storageRef:
        typeof img.storageRef === "string" ? img.storageRef : undefined,
      mimeType: typeof img.mimeType === "string" ? img.mimeType : undefined,
      organizationId:
        typeof img.organizationId === "string"
          ? img.organizationId
          : undefined,
      assetId: typeof img.assetId === "string" ? img.assetId : undefined,
    });
  }
  // Chat image URLs from multimodal items (authorized message attachments).
  for (const item of input.context.items) {
    if (item.modality !== "image") continue;
    if (!item.hasVisualProviderRef) continue;
    // Prefer matching metadata asset; chat URL refs are stamped onto metadata by apply.
  }

  return projectMultimodalForProvider({
    context: input.context,
    visualAssets,
  });
}

export { summarizeMultimodalForTrace };
