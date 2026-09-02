/**
 * M10.17 — Minimal production document indexing for Knowledge Intelligence.
 *
 * On upload of text/plain, text/markdown (and application/pdf when
 * `pdf-parse` is installed — otherwise skipped, see extractText()), we
 * extract text, chunk it (~800 chars), and store KnowledgeChunk rows.
 *
 * Semantic search uses cosine similarity when embeddings exist; otherwise
 * falls back to keyword matching. Embeddings are only generated through the
 * direct execution `embedding.generate` capability when the Enterprise API
 * runtime is mounted — never via a direct OpenAI SDK call from anywhere in
 * this service (and never from the frontend).
 */

import mongoose from "mongoose";
import { createHash } from "crypto";
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

/** TTL cache: orgId → { hasChunks, expiresAt }. Avoids Knowledge fetch tax on empty orgs. */
const ORG_CHUNK_PRESENCE_CACHE = new Map<
  string,
  { hasChunks: boolean; expiresAt: number }
>();
const ORG_CHUNK_PRESENCE_TTL_MS = 60_000;

export function invalidateOrganizationKnowledgeCache(
  organizationId: string
): void {
  ORG_CHUNK_PRESENCE_CACHE.delete(organizationId);
}

/**
 * Fast presence check used to skip Knowledge Intelligence when an org has
 * never indexed anything. Cached briefly so create path stays cheap.
 */
export async function organizationHasKnowledgeChunks(
  organizationId: string
): Promise<boolean> {
  if (!mongoose.isValidObjectId(organizationId)) return false;
  const cached = ORG_CHUNK_PRESENCE_CACHE.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.hasChunks;

  const exists = await KnowledgeChunk.exists({
    organizationId: new mongoose.Types.ObjectId(organizationId),
  });
  const hasChunks = Boolean(exists);
  ORG_CHUNK_PRESENCE_CACHE.set(organizationId, {
    hasChunks,
    expiresAt: Date.now() + ORG_CHUNK_PRESENCE_TTL_MS,
  });
  return hasChunks;
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

/** Best-effort embedding via direct execution — never OpenAI SDK directly. */
export async function tryGenerateEmbedding(
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
        metadata: { internal: true },
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

  await KnowledgeChunk.deleteMany({
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    assetId: new mongoose.Types.ObjectId(input.assetId),
  });

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
  invalidateOrganizationKnowledgeCache(input.organizationId);
  return { indexed: true, chunkCount: docs.length };
}

export interface IndexExecutionLearningInput {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly executionId: string;
  readonly prompt: string;
  readonly outputText: string;
  readonly capabilityId?: string;
  /** Optional productAction from metadata — used to skip noise (enhance, visuals). */
  readonly productAction?: string;
}

const EXECUTION_LEARNING_ASSET_PREFIX = "execution:";
const MIN_USER_BRIEF_CHARS = 24;
const MIN_OUTPUT_CHARS = 48;
const MAX_INDEX_CHARS = 6_000;
const SKIP_PRODUCT_ACTIONS = new Set([
  "enhance_prompt",
  "route_visual",
  "internal",
]);

export function executionLearningAssetId(executionId: string): mongoose.Types.ObjectId {
  const hash = createHash("md5")
    .update(`${EXECUTION_LEARNING_ASSET_PREFIX}${executionId}`)
    .digest("hex")
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hash);
}

/** Drop OS megaprompt / failed-run noise from retrieval (compounding quality). */
export function isJunkKnowledgeChunkText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (lower.includes("[knowledge status=empty]")) return true;
  if (lower.includes("[structured brief")) return true;
  if (lower.includes("[structured brand context")) return true;
  if (lower.includes("[structured knowledge context")) return true;
  if (lower.includes("produce the deliverable for this task only")) return true;
  if (lower.includes("do not invent product/business facts")) return true;
  if (
    lower.includes("user prompt:") &&
    lower.includes("execution output:") &&
    t.length > 900
  ) {
    return true;
  }
  if (/\b(timeout|failed at provider|http 5\d\d)\b/.test(lower) && t.length < 400) {
    return true;
  }
  return false;
}

/** Strip OS megaprompt wrappers so knowledge stores the user brief, not Brief/Brand blocks. */
function isolateUserBriefForKnowledge(prompt: string): string {
  const markers = [
    /\[User prompt\]\s*/i,
    /\[User brief\]\s*/i,
    /Original client brief:\s*/i,
  ];
  let text = prompt;
  for (const marker of markers) {
    const idx = text.search(marker);
    if (idx >= 0) {
      const match = text.slice(idx).match(marker);
      const start = idx + (match?.[0]?.length ?? 0);
      text = text.slice(start);
      break;
    }
  }
  return text
    .replace(/\[Product selection[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Selected brand[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Brief[\s\S]*?(?=\[Structured |$)/gi, " ")
    .replace(/\[Structured Brand Context[\s\S]*?(?=\[Structured |$)/gi, " ")
    .replace(/\[Structured Knowledge Context[\s\S]*?(?=\[Structured |$)/gi, " ")
    .replace(/\[Brand [^\]]*\]/gi, " ")
    .replace(/\[Knowledge [^\]]*\]/gi, " ")
    .replace(/\[Learned from this brief\][\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INDEX_CHARS);
}

function isSubstantiveExecutionLearning(
  userBrief: string,
  outputText: string,
  capabilityId?: string,
  productAction?: string
): { ok: true } | { ok: false; reason: string } {
  if (productAction && SKIP_PRODUCT_ACTIONS.has(productAction)) {
    return { ok: false, reason: `skip_product_action:${productAction}` };
  }
  if (capabilityId === "embedding.generate") {
    return { ok: false, reason: "skip_embedding_capability" };
  }
  if (userBrief.length < MIN_USER_BRIEF_CHARS && outputText.length < MIN_OUTPUT_CHARS) {
    return { ok: false, reason: "too_thin" };
  }
  if (outputText.length > 0 && outputText.length < MIN_OUTPUT_CHARS) {
    return { ok: false, reason: "output_too_short" };
  }
  const lower = outputText.toLowerCase();
  if (
    /\b(error|failed|timeout|unauthorized|forbidden|internal server)\b/.test(lower) &&
    outputText.length < 200
  ) {
    return { ok: false, reason: "error_like_output" };
  }
  return { ok: true };
}

/**
 * Index prompt + output from a completed execution into knowledge_chunks
 * so future retrievals can surface prior execution learnings.
 * Quality-gated: skips thin/error/enhance noise and strips OS megaprompt wrappers.
 */
export async function indexExecutionLearning(
  input: IndexExecutionLearningInput
): Promise<{ indexed: boolean; chunkCount: number; reason?: string }> {
  if (!mongoose.isValidObjectId(input.organizationId)) {
    return { indexed: false, chunkCount: 0, reason: "invalid_organization_id" };
  }
  const userBrief = isolateUserBriefForKnowledge(input.prompt);
  const outputText = input.outputText.trim().slice(0, MAX_INDEX_CHARS);
  if (!userBrief && !outputText) {
    return { indexed: false, chunkCount: 0, reason: "empty_content" };
  }

  const gate = isSubstantiveExecutionLearning(
    userBrief,
    outputText,
    input.capabilityId,
    input.productAction
  );
  if (!gate.ok) {
    return { indexed: false, chunkCount: 0, reason: gate.reason };
  }

  const combined = [
    userBrief ? `User prompt:\n${userBrief}` : "",
    outputText ? `Execution output:\n${outputText}` : "",
    input.capabilityId ? `Capability: ${input.capabilityId}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const chunks = chunkText(combined);
  if (!chunks.length) {
    return { indexed: false, chunkCount: 0, reason: "empty_after_chunking" };
  }

  const organizationId = new mongoose.Types.ObjectId(input.organizationId);
  const assetId = executionLearningAssetId(input.executionId);
  const assetName = `${EXECUTION_LEARNING_ASSET_PREFIX}${input.executionId}`;

  // Near-duplicate guard: skip if an identical first-chunk already exists for this org.
  const fingerprint = createHash("sha256")
    .update(chunks[0]!.slice(0, 400))
    .digest("hex");
  const dup = await KnowledgeChunk.findOne({
    organizationId,
    text: { $regex: chunks[0]!.slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
  })
    .select("_id text")
    .lean();
  if (dup?.text) {
    const existingFp = createHash("sha256")
      .update(String(dup.text).slice(0, 400))
      .digest("hex");
    if (existingFp === fingerprint) {
      return { indexed: false, chunkCount: 0, reason: "duplicate_content" };
    }
  }

  await KnowledgeChunk.deleteMany({
    organizationId,
    assetId,
  });

  const docs = await Promise.all(
    chunks.map(async (chunk, idx) => {
      const embedding = await tryGenerateEmbedding(chunk, input.organizationId);
      return {
        organizationId,
        brandId:
          input.brandId && mongoose.isValidObjectId(input.brandId)
            ? new mongoose.Types.ObjectId(input.brandId)
            : undefined,
        assetId,
        assetName,
        chunkIndex: idx,
        text: chunk,
        embedding,
      };
    })
  );
  await KnowledgeChunk.insertMany(docs);
  invalidateOrganizationKnowledgeCache(input.organizationId);
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
  if (input.brandId && mongoose.isValidObjectId(input.brandId)) {
    filter.$or = [
      { brandId: new mongoose.Types.ObjectId(input.brandId) },
      { brandId: null },
      { brandId: { $exists: false } },
    ];
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

export interface KnowledgeChunkDetailedHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly organizationId: string;
  readonly title: string;
  readonly content: string;
  readonly retrievalScore: number;
  readonly retrievalMethod: "keyword" | "embedding" | "hybrid";
  readonly sourceType: "USER_UPLOADED";
  readonly updatedAt?: string;
  readonly brandId?: string;
}

/**
 * Phase 3 — org-scoped retrieval returning full chunk text for KnowledgeContext.
 * Always filters by organizationId at the Mongo boundary.
 */
export async function searchKnowledgeChunksDetailed(
  input: SearchDocumentsInput
): Promise<KnowledgeChunkDetailedHit[]> {
  const q = input.q.trim();
  if (!q) return [];
  if (!mongoose.isValidObjectId(input.organizationId)) return [];
  const limit = Math.min(input.limit ?? 8, 20);
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2)
    .slice(0, 8);
  const textOrClauses: Record<string, unknown>[] = [
    { text: { $regex: q.slice(0, 120), $options: "i" } },
  ];
  for (const t of tokens) {
    textOrClauses.push({
      text: {
        $regex: t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      },
    });
  }

  const andClauses: Record<string, unknown>[] = [
    { organizationId: new mongoose.Types.ObjectId(input.organizationId) },
    { $or: textOrClauses },
  ];
  if (input.brandId && mongoose.isValidObjectId(input.brandId)) {
    // Prefer brand-scoped chunks, but also include org-wide (no brandId) so
    // execution/upload learning without brandId still compounds for the brand.
    andClauses.push({
      $or: [
        { brandId: new mongoose.Types.ObjectId(input.brandId) },
        { brandId: null },
        { brandId: { $exists: false } },
      ],
    });
  }

  const candidates = await KnowledgeChunk.find({ $and: andClauses })
    .limit(200)
    .select("organizationId brandId assetId assetName chunkIndex text embedding updatedAt");

  if (!candidates.length) return [];

  const queryEmbedding = await tryGenerateEmbedding(q, input.organizationId);
  const scored = candidates
    .filter(
      (c: IKnowledgeChunk) =>
        c.organizationId.toString() === input.organizationId
    )
    .filter((c: IKnowledgeChunk) => !isJunkKnowledgeChunkText(c.text))
    .map((c: IKnowledgeChunk) => {
      let score: number;
      let method: "keyword" | "embedding" | "hybrid" = "keyword";
      // Slight boost for brand-scoped hits when a brandId was requested.
      const brandBoost =
        input.brandId &&
        c.brandId &&
        c.brandId.toString() === input.brandId
          ? 8
          : 0;
      if (queryEmbedding && c.embedding?.length) {
        score = cosineSimilarity(queryEmbedding, c.embedding) * 100 + brandBoost;
        method = "embedding";
      } else {
        const lower = c.text.toLowerCase();
        const ql = q.toLowerCase();
        const occurrences = lower.split(ql).length - 1;
        const tokenHits = tokens.reduce(
          (n, t) => n + (lower.includes(t.toLowerCase()) ? 1 : 0),
          0
        );
        score = Math.min(95, 25 + occurrences * 12 + tokenHits * 8 + brandBoost);
      }
      return { chunk: c, score, method };
    });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ chunk, score, method }) => ({
    chunkId: `${chunk.assetId.toString()}#${chunk.chunkIndex}`,
    documentId: chunk.assetId.toString(),
    organizationId: chunk.organizationId.toString(),
    title: chunk.assetName || "Document",
    content: chunk.text,
    retrievalScore: score,
    retrievalMethod: method,
    sourceType: "USER_UPLOADED" as const,
    updatedAt: chunk.updatedAt?.toISOString?.(),
    brandId: chunk.brandId?.toString(),
  }));
}
