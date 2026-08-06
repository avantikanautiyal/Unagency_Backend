/**
 * M10.17 — Minimal production document indexing for Knowledge Intelligence.
 *
 * On upload of text/plain, text/markdown (and application/pdf when
 * `pdf-parse` is installed — otherwise skipped, see extractText()), we
 * extract text, chunk it (~800 chars), and store KnowledgeChunk rows.
 *
 * Semantic search uses cosine similarity when embeddings exist; otherwise
 * falls back to keyword matching. Embeddings are only generated through the
 * Intelligence OS `embedding.generate` capability when the Enterprise API
 * runtime is mounted — never via a direct OpenAI SDK call from anywhere in
 * this service (and never from the frontend).
 */

import mongoose from "mongoose";
import KnowledgeChunk, { type IKnowledgeChunk } from "../models/knowledgeChunk.model";
import { getProductAssetBlobStorage } from "./product-asset-storage";
import { getEnterpriseApiRuntime } from "../platform/api/runtime/bootstrap-enterprise-api";
import type { SearchHit } from "./product-search-service";

const CHUNK_SIZE_CHARS = 800;
const INDEXABLE_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
]);

export function isIndexableMimeType(mimeType: string | undefined): boolean {
  return !!mimeType && INDEXABLE_MIME_TYPES.has(mimeType);
}

export function chunkText(
  text: string,
  chunkSize: number = CHUNK_SIZE_CHARS
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += chunkSize) {
    const chunk = clean.slice(i, i + chunkSize).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

/**
 * Extract plain text from supported document bytes.
 * PDF extraction requires the optional `pdf-parse` package; when it isn't
 * installed we skip indexing rather than fabricate content.
 */
async function extractText(
  mimeType: string,
  bytes: Buffer
): Promise<string | undefined> {
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return bytes.toString("utf8");
  }
  if (mimeType === "application/pdf") {
    try {
      // Optional dependency — not in package.json today. If a future
      // install adds it, indexing picks it up automatically.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(bytes);
      return typeof result?.text === "string" ? result.text : undefined;
    } catch {
      // pdf-parse not available — skip PDF extraction (no fake content).
      return undefined;
    }
  }
  return undefined;
}

/** Best-effort embedding via Intelligence OS — never OpenAI SDK directly. */
async function tryGenerateEmbedding(
  text: string,
  organizationId: string
): Promise<number[] | undefined> {
  const runtime = getEnterpriseApiRuntime();
  if (!runtime || runtime.executionMode !== "live") return undefined;
  try {
    const result = await runtime.platform.executions.create(
      {
        prompt: text.slice(0, 8000),
        organizationId,
        capabilityId: "embedding.generate",
        metadata: { skipBrandKnowledge: true, internal: true },
      },
      {
        userId: "system_knowledge_indexer",
        organizationId,
        roles: ["service"],
      } as never
    );
    if (!result.ok) return undefined;
    const data = result.value.result?.data as
      | { embedding?: { vector?: readonly number[] } }
      | undefined;
    const vector = data?.embedding?.vector;
    return Array.isArray(vector) && vector.length ? [...vector] : undefined;
  } catch {
    return undefined;
  }
}

export interface IndexAssetInput {
  organizationId: string;
  brandId?: string;
  assetId: string;
  assetName: string;
  mimeType: string;
  storageKey: string;
}

export async function indexProductAsset(
  input: IndexAssetInput
): Promise<{ indexed: boolean; chunkCount: number; reason?: string }> {
  if (!isIndexableMimeType(input.mimeType)) {
    return { indexed: false, chunkCount: 0, reason: "unsupported_mime_type" };
  }
  const storage = getProductAssetBlobStorage();
  const got = await storage.get(input.storageKey);
  if (!got.ok || !got.value) {
    return { indexed: false, chunkCount: 0, reason: "blob_not_found" };
  }
  const bytes = Buffer.from(got.value.data, "base64");
  const text = await extractText(input.mimeType, bytes);
  if (!text || !text.trim()) {
    return { indexed: false, chunkCount: 0, reason: "no_extractable_text" };
  }

  const chunks = chunkText(text);
  if (!chunks.length) {
    return { indexed: false, chunkCount: 0, reason: "empty_after_chunking" };
  }

  await KnowledgeChunk.deleteMany({ assetId: new mongoose.Types.ObjectId(input.assetId) });

  const docs = await Promise.all(
    chunks.map(async (chunk, idx) => {
      const embedding = await tryGenerateEmbedding(chunk, input.organizationId);
      return {
        organizationId: new mongoose.Types.ObjectId(input.organizationId),
        brandId: input.brandId ? new mongoose.Types.ObjectId(input.brandId) : undefined,
        assetId: new mongoose.Types.ObjectId(input.assetId),
        assetName: input.assetName,
        chunkIndex: idx,
        text: chunk,
        embedding,
      };
    })
  );
  await KnowledgeChunk.insertMany(docs);
  return { indexed: true, chunkCount: docs.length };
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchDocumentsInput {
  organizationId: string;
  brandId?: string;
  q: string;
  limit?: number;
}

/**
 * Keyword search over indexed chunks (default) — upgraded to cosine
 * similarity automatically when both the query and a chunk have
 * embeddings available.
 */
export async function searchKnowledgeChunks(
  input: SearchDocumentsInput
): Promise<SearchHit[]> {
  const q = input.q.trim();
  if (!q) return [];
  const limit = Math.min(input.limit ?? 20, 50);
  const filter: Record<string, unknown> = {
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
  };
  if (input.brandId) {
    filter.brandId = new mongoose.Types.ObjectId(input.brandId);
  }
  const candidates = await KnowledgeChunk.find({
    ...filter,
    text: { $regex: q, $options: "i" },
  })
    .limit(200)
    .select("assetId assetName chunkIndex text embedding");

  if (!candidates.length) return [];

  const queryEmbedding = await tryGenerateEmbedding(q, input.organizationId);
  const scored = candidates.map((c: IKnowledgeChunk) => {
    let score: number;
    if (queryEmbedding && c.embedding?.length) {
      score = cosineSimilarity(queryEmbedding, c.embedding) * 100;
    } else {
      const lower = c.text.toLowerCase();
      const ql = q.toLowerCase();
      const occurrences = lower.split(ql).length - 1;
      score = Math.min(90, 30 + occurrences * 10);
    }
    return { chunk: c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ chunk, score }) => ({
    kind: "document" as const,
    id: `${chunk.assetId.toString()}#${chunk.chunkIndex}`,
    title: chunk.assetName || "Document",
    subtitle: chunk.text.slice(0, 100),
    score,
  }));
}
