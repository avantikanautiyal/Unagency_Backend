/**
 * Chat messages persist creative links (metadata.routes[].imageUri, metadata.url)
 * as S3 presigned URLs that expire after ~5 minutes. Re-sign every link that
 * points at our own bucket whenever history is served, so staff portals (and
 * any later reader) can still display the creatives.
 */

import { blobStorageConfigFromEnv } from "../persistence/storage/blob-storage-config";
import { getProductAssetBlobStorage } from "../../services/product-asset-storage";

const RESIGN_TTL_SECONDS = 3600;
const URL_KEYS = ["imageUri", "videoUri", "url", "mediaUrl", "thumbnailUri", "previewUri"];

/** Object key when `raw` is a URL for `bucket` (virtual-hosted or path style). */
export function s3KeyFromUrl(raw: string, bucket: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith("amazonaws.com")) return null;
  const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (host.startsWith(`${bucket.toLowerCase()}.s3`)) return path || null;
  if (host.startsWith("s3") && path.startsWith(`${bucket}/`)) {
    return path.slice(bucket.length + 1) || null;
  }
  return null;
}

function collectUrlSlots(
  node: unknown,
  out: Array<{ holder: Record<string, unknown>; key: string; value: string }>,
  depth = 0,
): void {
  if (!node || typeof node !== "object" || depth > 4) return;
  if (Array.isArray(node)) {
    for (const item of node) collectUrlSlots(item, out, depth + 1);
    return;
  }
  const holder = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(holder)) {
    if (typeof value === "string" && URL_KEYS.includes(key) && value.startsWith("http")) {
      out.push({ holder, key, value });
    } else if (value && typeof value === "object") {
      collectUrlSlots(value, out, depth + 1);
    }
  }
}

/** Mutates each metadata object in place with freshly signed URLs. Never throws. */
export async function refreshMessageMediaUrls(
  metadatas: Array<Record<string, unknown> | undefined | null>,
): Promise<void> {
  try {
    const config = blobStorageConfigFromEnv();
    if (!config) return;
    const slots: Array<{ holder: Record<string, unknown>; key: string; value: string }> = [];
    for (const meta of metadatas) collectUrlSlots(meta, slots);
    if (!slots.length) return;
    const storage = getProductAssetBlobStorage();
    const sign = storage.createSignedGetUrl?.bind(storage);
    if (!sign) return;
    const signedByKey = new Map<string, Promise<string | null>>();
    await Promise.all(
      slots.map(async (slot) => {
        const objectKey = s3KeyFromUrl(slot.value, config.bucket);
        if (!objectKey) return;
        let pending = signedByKey.get(objectKey);
        if (!pending) {
          pending = sign(objectKey, RESIGN_TTL_SECONDS, {
              cacheControl: "private, max-age=3600",
            })
            .then((res) => (res.ok ? res.value : null))
            .catch(() => null);
          signedByKey.set(objectKey, pending);
        }
        const fresh = await pending;
        if (fresh) slot.holder[slot.key] = fresh;
      }),
    );
  } catch {
    // Best effort — stale links are no worse than before.
  }
}

type ApprovedEntry = { artifactId?: string; executionId?: string; note?: string };

/**
 * Stamp `approved: true` on route cards the client approved (cdf session
 * `approved[]`), so staff portals can show the same "Approved" marking the
 * client sees. Media cards match by artifact id; text choices share one
 * artifact, so the choice title named in the approval note picks the card.
 */
export async function stampApprovedRoutes(
  organizationId: string | undefined,
  metadatas: Array<Record<string, unknown> | undefined | null>,
): Promise<void> {
  try {
    if (!organizationId) return;
    const routeSets: Array<Array<Record<string, unknown>>> = [];
    const artifactIds = new Set<string>();
    for (const meta of metadatas) {
      const routes = meta?.routes;
      if (!Array.isArray(routes) || !routes.length) continue;
      const rows = routes.filter(
        (r): r is Record<string, unknown> => Boolean(r) && typeof r === "object",
      );
      routeSets.push(rows);
      for (const r of rows) {
        if (typeof r.artifactId === "string" && r.artifactId) artifactIds.add(r.artifactId);
      }
    }
    if (!artifactIds.size) return;
    const { default: mongoose } = await import("mongoose");
    const db = mongoose.connection?.db;
    if (!db) return;
    const sessions = await db
      .collection("cdf_sessions")
      .find(
        {
          organizationId,
          "snapshot.approved.artifactId": { $in: [...artifactIds] },
        },
        { projection: { "snapshot.approved": 1 } },
      )
      .limit(50)
      .toArray();
    const approvedByArtifact = new Map<string, ApprovedEntry[]>();
    for (const s of sessions) {
      const approved = (s as { snapshot?: { approved?: ApprovedEntry[] } }).snapshot?.approved;
      for (const a of approved ?? []) {
        if (!a?.artifactId || !artifactIds.has(a.artifactId)) continue;
        const list = approvedByArtifact.get(a.artifactId) ?? [];
        list.push(a);
        approvedByArtifact.set(a.artifactId, list);
      }
    }
    if (!approvedByArtifact.size) return;
    // Direction picks (text routes) are not always in approved[]; later stage
    // notes carry "Selected direction: Choice N — <title>".
    const selectedTitles = new Set<string>();
    for (const s of sessions) {
      const approved = (s as { snapshot?: { approved?: ApprovedEntry[] } }).snapshot?.approved;
      for (const a of approved ?? []) {
        for (const m of (a?.note ?? "").matchAll(/Selected direction:[^\n—-]*[—-]\s*([^\n]+)/gi)) {
          selectedTitles.add(m[1].trim().toLowerCase());
        }
      }
    }
    for (const rows of routeSets) {
      for (const r of rows) {
        if (r.mediaKind !== "text" || r.approved) continue;
        const title = String(r.title ?? "").trim().toLowerCase();
        if (title && selectedTitles.has(title)) r.approved = true;
      }
    }
    for (const rows of routeSets) {
      const byArtifact = new Map<string, Array<Record<string, unknown>>>();
      for (const r of rows) {
        const id = typeof r.artifactId === "string" ? r.artifactId : "";
        if (!id || !approvedByArtifact.has(id)) continue;
        byArtifact.set(id, [...(byArtifact.get(id) ?? []), r]);
      }
      for (const [id, cards] of byArtifact) {
        const entries = approvedByArtifact.get(id) ?? [];
        if (cards.length === 1) {
          cards[0].approved = true;
          continue;
        }
        // Several cards share the artifact (text choices / document parts).
        const notes = entries.map((e) => (e.note ?? "").toLowerCase());
        const named = cards.filter((c) => {
          const title = String(c.title ?? "").trim().toLowerCase();
          return title.length > 2 && notes.some((n) => n.includes(`— ${title}`) || n.includes(`- ${title}`));
        });
        if (named.length) {
          for (const c of named) c.approved = true;
        } else if (cards.every((c) => c.documentPart != null)) {
          for (const c of cards) c.approved = true; // multi-part set approved as a whole
        }
      }
    }
  } catch {
    // Best effort — marking is cosmetic.
  }
}
