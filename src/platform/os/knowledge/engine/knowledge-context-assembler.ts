/**
 * Assemble KnowledgeHits → KnowledgeContext (dedupe, budget, conflicts).
 */

import {
  KNOWLEDGE_CONTEXT_VERSION,
  type GetKnowledgeContextInput,
  type KnowledgeConflict,
  type KnowledgeContext,
  type KnowledgeFact,
  type KnowledgeHit,
  type KnowledgeRetrievedChunk,
  type KnowledgeSourceReference,
} from "../contracts/knowledge-context";
import { validateKnowledgeContext } from "../validation/validate-knowledge-context";
import { isJunkKnowledgeChunkText } from "../../../../services/knowledge-document-index-service";

const PRICE_RE = /(?:₹|rs\.?\s*|inr\s*|usd\s*|\$)\s*[\d,]+(?:\.\d+)?/gi;
const BATTERY_RE = /\b(\d+)\s*(?:hours?|hrs?)\b/gi;

function hashParts(parts: readonly string[]): string {
  let h = 2166136261;
  const joined = parts.join("|");
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `kch_${(h >>> 0).toString(16)}`;
}

function extractFacts(hits: readonly KnowledgeHit[]): {
  readonly facts: KnowledgeFact[];
  readonly conflicts: KnowledgeConflict[];
} {
  const priceBySource = new Map<string, string>();
  const batteryBySource = new Map<string, string>();
  const productNames: KnowledgeFact[] = [];
  const structuredFromPrompt: KnowledgeFact[] = [];

  for (const hit of hits) {
    const prices = hit.content.match(PRICE_RE) ?? [];
    for (const p of prices) {
      priceBySource.set(hit.documentId, p.replace(/\s+/g, " ").trim());
    }
    const batteries = [...hit.content.matchAll(BATTERY_RE)];
    for (const m of batteries) {
      batteryBySource.set(hit.documentId, `${m[1]} hours`);
    }
    const nameMatch = hit.content.match(
      /\b(?:product|name)\s*[:=]\s*([^\n.;]+)/i
    );
    if (nameMatch?.[1]) {
      productNames.push({
        key: "product_name",
        value: nameMatch[1].trim(),
        sourceId: hit.documentId,
        provenance: "STRUCTURED_FACT",
        confidence: 0.75,
      });
    }

    // K1 prompt-fact chunks: "brand_name: Acme (confidence=0.90)"
    if (hit.title?.startsWith("prompt_fact:") || hit.content.includes("[Prompt facts")) {
      const lineRe =
        /^(brand_name|product_name|audience|usp|offer|industry|price|location)\s*:\s*(.+?)(?:\s*\(confidence=[\d.]+\))?\s*$/gim;
      let m: RegExpExecArray | null;
      while ((m = lineRe.exec(hit.content)) !== null) {
        const key = m[1]!.toLowerCase();
        const value = m[2]!.trim();
        if (!value) continue;
        structuredFromPrompt.push({
          key,
          value,
          sourceId: hit.documentId,
          provenance: "STRUCTURED_FACT",
          confidence: 0.85,
        });
      }
    }
  }

  const facts: KnowledgeFact[] = [...structuredFromPrompt, ...productNames];
  const conflicts: KnowledgeConflict[] = [];

  const uniquePrices = [...new Set(priceBySource.values())];
  if (uniquePrices.length === 1) {
    facts.push({
      key: "price",
      value: uniquePrices[0]!,
      sourceId: [...priceBySource.keys()][0]!,
      provenance: "STRUCTURED_FACT",
      confidence: 0.8,
    });
  } else if (uniquePrices.length > 1) {
    conflicts.push({
      key: "price",
      values: uniquePrices,
      sourceIds: [...priceBySource.keys()],
      resolutionStatus: "unresolved",
    });
  }

  const uniqueBatteries = [...new Set(batteryBySource.values())];
  if (uniqueBatteries.length === 1) {
    facts.push({
      key: "battery",
      value: uniqueBatteries[0]!,
      sourceId: [...batteryBySource.keys()][0]!,
      provenance: "STRUCTURED_FACT",
      confidence: 0.75,
    });
  } else if (uniqueBatteries.length > 1) {
    conflicts.push({
      key: "battery",
      values: uniqueBatteries,
      sourceIds: [...batteryBySource.keys()],
      resolutionStatus: "unresolved",
    });
  }

  return { facts, conflicts };
}

export function assembleKnowledgeContext(input: {
  readonly tenant: GetKnowledgeContextInput;
  readonly query: string;
  readonly hits: readonly KnowledgeHit[];
  readonly available: boolean;
  readonly failureReason?: string;
}): KnowledgeContext {
  const nowIso = input.tenant.nowIso ?? (() => new Date().toISOString());
  const createId = input.tenant.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const retrievedAt = nowIso();

  if (!input.available) {
    return validateKnowledgeContext({
      id: createId("kctx"),
      version: KNOWLEDGE_CONTEXT_VERSION,
      organizationId: input.tenant.organizationId,
      executionId: input.tenant.executionId,
      brandId: input.tenant.brandId,
      query: input.query,
      taskType: input.tenant.briefIntent,
      status: "FAILED",
      facts: [],
      retrievedChunks: [],
      relevantSources: [],
      sourceReferences: [],
      conflicts: [],
      warnings: [
        {
          code: "KNOWLEDGE_STORE_UNAVAILABLE",
          message: input.failureReason ?? "Knowledge store unavailable",
        },
      ],
      completeness: "EMPTY",
      confidence: { system: 0 },
      provenance: [
        {
          field: "status",
          value: "FAILED",
          source: "SYSTEM_RULE",
        },
      ],
      knowledgeVersion: "0",
      retrievedAt,
      contextHash: hashParts([
        input.tenant.organizationId,
        "FAILED",
        input.failureReason ?? "",
      ]),
      failureReason: input.failureReason,
    });
  }

  // Tenant filter — never accept foreign org hits; drop OS megaprompt noise.
  const tenantHits = input.hits.filter(
    (h) => h.organizationId === input.tenant.organizationId
  );
  const cleanHits = tenantHits.filter(
    (h) => !isJunkKnowledgeChunkText(h.content)
  );

  // Dedupe by documentId+content prefix
  const seen = new Set<string>();
  const deduped: KnowledgeHit[] = [];
  for (const h of cleanHits) {
    const key = `${h.documentId}:${h.content.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
  }

  const maxChars = input.tenant.maxContentChars ?? 1600;
  const selected: KnowledgeHit[] = [];
  let used = 0;
  for (const h of deduped) {
    if (used >= maxChars) break;
    selected.push(h);
    used += h.content.length;
  }

  const chunks: KnowledgeRetrievedChunk[] = selected.map((h) => ({
    chunkId: h.chunkId,
    documentId: h.documentId,
    title: h.title,
    content: h.content.slice(0, 1200),
    retrievalScore: h.retrievalScore,
    retrievalMethod: h.retrievalMethod,
    sourceType: h.sourceType,
    updatedAt: h.updatedAt,
  }));

  const sources: KnowledgeSourceReference[] = [];
  const sourceIds = new Set<string>();
  for (const h of selected) {
    if (sourceIds.has(h.documentId)) continue;
    sourceIds.add(h.documentId);
    sources.push({
      sourceId: h.documentId,
      sourceType: h.sourceType,
      organizationId: h.organizationId,
      documentId: h.documentId,
      chunkId: h.chunkId,
      title: h.title,
      updatedAt: h.updatedAt,
    });
  }

  const { facts, conflicts } = extractFacts(selected);
  const status =
    conflicts.length > 0
      ? "CONFLICTED"
      : chunks.length === 0
        ? "EMPTY"
        : facts.length > 0 || chunks.length >= 2
          ? "READY"
          : "PARTIAL";

  const knowledgeVersion = hashParts(
    selected.map((h) => `${h.documentId}:${h.updatedAt ?? ""}:${h.chunkId}`)
  );

  return validateKnowledgeContext({
    id: createId("kctx"),
    version: KNOWLEDGE_CONTEXT_VERSION,
    organizationId: input.tenant.organizationId,
    executionId: input.tenant.executionId,
    brandId: input.tenant.brandId,
    query: input.query,
    taskType: input.tenant.briefIntent,
    status,
    facts,
    retrievedChunks: chunks,
    relevantSources: sources,
    sourceReferences: sources.map(
      (s) => `${s.sourceType}:${s.sourceId}${s.chunkId ? `#${s.chunkId}` : ""}`
    ),
    conflicts,
    warnings: conflicts.map((c) => ({
      code: "KNOWLEDGE_CONFLICT",
      message: `Conflicting values for ${c.key}: ${c.values.join(" vs ")}`,
    })),
    completeness:
      chunks.length === 0 ? "EMPTY" : facts.length > 0 ? "COMPLETE" : "PARTIAL",
    confidence: {
      system: Math.min(
        1,
        chunks.length === 0
          ? 0
          : 0.35 +
            Math.min(0.4, chunks.length * 0.1) +
            (facts.length ? 0.15 : 0) -
            (conflicts.length ? 0.2 : 0)
      ),
    },
    provenance: [
      {
        field: "query",
        value: input.query.slice(0, 120),
        source: "SYSTEM_RULE",
      },
      ...facts.map((f) => ({
        field: f.key,
        value: f.value,
        source: f.provenance,
      })),
    ],
    knowledgeVersion,
    retrievedAt,
    contextHash: hashParts([
      input.tenant.organizationId,
      knowledgeVersion,
      status,
      String(chunks.length),
    ]),
  });
}
