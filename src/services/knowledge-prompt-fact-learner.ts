/**
 * K1 — Prompt → Knowledge fact learner
 *
 * Extracts high-confidence business facts from the user brief (not creative
 * fluff) and indexes them into knowledge_chunks so Knowledge Intelligence
 * compounds with every prompt — without blocking the create path.
 *
 * Performance rules:
 * - Fire-and-forget from callers (never await on the hot path)
 * - Skip enhance / route_visual / internal / thin briefs
 * - Only persist explicit, high-confidence facts
 */

import { createHash } from "crypto";
import mongoose from "mongoose";
import KnowledgeChunk from "../models/knowledgeChunk.model";
import {
  invalidateOrganizationKnowledgeCache,
  tryGenerateEmbedding,
} from "./knowledge-document-index-service";

export type PromptFact = {
  readonly key: string;
  readonly value: string;
  readonly confidence: number;
};

const PROMPT_FACT_ASSET_PREFIX = "prompt_fact:";
const MIN_BRIEF_CHARS = 32;
const MIN_FACT_CONFIDENCE = 0.7;
const SKIP_PRODUCT_ACTIONS = new Set([
  "enhance_prompt",
  "route_visual",
  "internal",
]);

/** Strip OS megaprompt wrappers to the raw client brief. */
export function isolateUserBriefForFacts(prompt: string): string {
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
    .replace(/Produce exactly \d+[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4_000);
}

function cleanValue(raw: string): string {
  return raw
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "")
    .slice(0, 160);
}

function pushFact(
  out: PromptFact[],
  key: string,
  raw: string | undefined,
  confidence: number
): void {
  if (!raw || confidence < MIN_FACT_CONFIDENCE) return;
  const value = cleanValue(raw);
  if (value.length < 2 || value.length > 160) return;
  // Skip creative fluff / instructions mistaken as facts.
  if (
    /\b(create|generate|make|design|write|pitch deck|creative|route)\b/i.test(
      value
    ) &&
    value.split(/\s+/).length > 6
  ) {
    return;
  }
  if (out.some((f) => f.key === key && f.value.toLowerCase() === value.toLowerCase())) {
    return;
  }
  out.push({ key, value, confidence });
}

/**
 * Deterministic high-confidence fact extraction from a user brief.
 * Prefer explicit labels ("audience:", "product:") over loose inference.
 */
export function extractPromptFacts(brief: string): PromptFact[] {
  const text = brief.trim();
  if (text.length < MIN_BRIEF_CHARS) return [];

  const facts: PromptFact[] = [];

  // Explicit labelled fields
  const labelled: Array<[string, RegExp, number]> = [
    [
      "product_name",
      /\b(?:product|offering|app|platform)\s*(?:name)?\s*[:=]\s*([^\n.;|]{2,80})/i,
      0.9,
    ],
    [
      "brand_name",
      /\b(?:brand|company|business)\s*(?:name)?\s*[:=]\s*([^\n.;|]{2,80})/i,
      0.9,
    ],
    [
      "audience",
      /\b(?:target\s+)?audience\s*[:=]\s*([^\n.;|]{2,100})/i,
      0.9,
    ],
    [
      "usp",
      /\b(?:usp|unique\s+selling\s+(?:point|proposition)|value\s+prop(?:osition)?)\s*[:=]\s*([^\n.;|]{2,120})/i,
      0.88,
    ],
    [
      "offer",
      /\b(?:we\s+offer|offering|our\s+offer)\s*[:=]?\s*([^\n.;|]{2,120})/i,
      0.8,
    ],
    [
      "industry",
      /\b(?:industry|category|vertical)\s*[:=]\s*([^\n.;|]{2,80})/i,
      0.85,
    ],
    [
      "price",
      /\b(?:price|pricing|costs?)\s*[:=]\s*((?:₹|rs\.?\s*|inr\s*|usd\s*|\$)?\s*[\d,]+(?:\.\d+)?(?:\s*\/\s*\w+)?)/i,
      0.9,
    ],
  ];

  for (const [key, re, conf] of labelled) {
    const m = text.match(re);
    if (m?.[1]) pushFact(facts, key, m[1], conf);
  }

  // "for <BrandName>" / "called <Name>" / "named <Name>"
  const brandCalled = text.match(
    /\b(?:called|named|brand(?:ed)?)\s+["']?([A-Z][\w&.'-]{1,40}(?:\s+[A-Z][\w&.'-]{1,40}){0,2})["']?/
  );
  if (brandCalled?.[1]) {
    pushFact(facts, "brand_name", brandCalled[1], 0.78);
  }

  const forBrand = text.match(
    /\b(?:for|about)\s+(?:the\s+)?(?:brand\s+)?["']?([A-Z][\w&.'-]{1,40}(?:\s+[A-Z][\w&.'-]{1,40}){0,2})["']?(?:\s|,|\.|$)/
  );
  if (forBrand?.[1] && !/^(A|An|The|Our|My|This|That)$/i.test(forBrand[1])) {
    pushFact(facts, "brand_name", forBrand[1], 0.72);
  }

  // Audience phrases: "for Gen Z founders", "aimed at small businesses"
  const audiencePhrase = text.match(
    /\b(?:aimed\s+at|targeting|for)\s+((?:gen\s*z|millennials?|founders?|startups?|smbs?|small\s+business(?:es)?|enterprises?|parents?|students?|professionals?)[^\n.;,]{0,60})/i
  );
  if (audiencePhrase?.[1]) {
    pushFact(facts, "audience", audiencePhrase[1], 0.8);
  }

  // Price in free text
  if (!facts.some((f) => f.key === "price")) {
    const priceFree = text.match(
      /(?:₹|rs\.?\s*|inr\s*|usd\s*|\$)\s*[\d,]+(?:\.\d+)?(?:\s*\/\s*\w+)?/i
    );
    if (priceFree?.[0]) {
      pushFact(facts, "price", priceFree[0], 0.82);
    }
  }

  // Location: "based in X"
  const basedIn = text.match(
    /\bbased\s+in\s+([A-Z][\w\s,'-]{1,60}?)(?:\.|,|;|$)/
  );
  if (basedIn?.[1]) {
    pushFact(facts, "location", basedIn[1], 0.8);
  }

  return facts
    .filter((f) => f.confidence >= MIN_FACT_CONFIDENCE)
    .slice(0, 8);
}

export function promptFactAssetId(executionId: string): mongoose.Types.ObjectId {
  const hash = createHash("md5")
    .update(`${PROMPT_FACT_ASSET_PREFIX}${executionId}`)
    .digest("hex")
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hash);
}

function formatFactsChunk(facts: readonly PromptFact[], briefPreview: string): string {
  const lines = [
    "[Prompt facts — high-confidence business signals]",
    ...facts.map(
      (f) => `${f.key}: ${f.value} (confidence=${f.confidence.toFixed(2)})`
    ),
    `Brief preview: ${briefPreview.slice(0, 240)}`,
  ];
  return lines.join("\n");
}

export type IndexPromptFactsInput = {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly executionId: string;
  readonly prompt: string;
  readonly productAction?: string;
  readonly capabilityId?: string;
};

/**
 * Extract + index prompt facts. Safe to call fire-and-forget.
 */
export async function indexPromptFacts(
  input: IndexPromptFactsInput
): Promise<{ indexed: boolean; factCount: number; reason?: string }> {
  if (!mongoose.isValidObjectId(input.organizationId)) {
    return { indexed: false, factCount: 0, reason: "invalid_organization_id" };
  }
  if (!input.executionId?.trim()) {
    return { indexed: false, factCount: 0, reason: "missing_execution_id" };
  }
  if (
    input.productAction &&
    SKIP_PRODUCT_ACTIONS.has(input.productAction)
  ) {
    return {
      indexed: false,
      factCount: 0,
      reason: `skip_product_action:${input.productAction}`,
    };
  }
  if (input.capabilityId === "embedding.generate") {
    return { indexed: false, factCount: 0, reason: "skip_embedding_capability" };
  }

  const brief = isolateUserBriefForFacts(input.prompt);
  if (brief.length < MIN_BRIEF_CHARS) {
    return { indexed: false, factCount: 0, reason: "brief_too_thin" };
  }

  const facts = extractPromptFacts(brief);
  if (!facts.length) {
    return { indexed: false, factCount: 0, reason: "no_high_confidence_facts" };
  }

  const chunkText = formatFactsChunk(facts, brief);
  const fingerprint = createHash("sha256")
    .update(
      facts
        .map((f) => `${f.key}=${f.value.toLowerCase()}`)
        .sort()
        .join("|")
    )
    .digest("hex");

  const organizationId = new mongoose.Types.ObjectId(input.organizationId);

  // Near-dup: same fact set already stored for this org recently.
  const existing = await KnowledgeChunk.findOne({
    organizationId,
    assetName: { $regex: `^${PROMPT_FACT_ASSET_PREFIX}` },
    text: { $regex: facts[0]!.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
  })
    .select("text")
    .lean();
  if (existing?.text) {
    const existingFp = createHash("sha256")
      .update(
        String(existing.text)
          .split("\n")
          .filter((l) => /^[a-z_]+:/i.test(l))
          .map((l) => l.toLowerCase())
          .sort()
          .join("|")
      )
      .digest("hex");
    // Soft check — if first fact value already present in a prompt_fact chunk, skip exact same set.
    if (
      facts.every((f) =>
        String(existing.text).toLowerCase().includes(f.value.toLowerCase())
      )
    ) {
      return { indexed: false, factCount: 0, reason: "duplicate_facts" };
    }
    void existingFp;
    void fingerprint;
  }

  const assetId = promptFactAssetId(input.executionId);
  const assetName = `${PROMPT_FACT_ASSET_PREFIX}${input.executionId}`;

  await KnowledgeChunk.deleteMany({ organizationId, assetId });

  let embedding: number[] | undefined;
  try {
    embedding = await tryGenerateEmbedding(chunkText, input.organizationId);
  } catch {
    embedding = undefined;
  }

  await KnowledgeChunk.create({
    organizationId,
    brandId:
      input.brandId && mongoose.isValidObjectId(input.brandId)
        ? new mongoose.Types.ObjectId(input.brandId)
        : undefined,
    assetId,
    assetName,
    chunkIndex: 0,
    text: chunkText,
    embedding,
  });

  invalidateOrganizationKnowledgeCache(input.organizationId);

  console.log(
    `🧠 [AI OS] knowledge prompt facts | org=${input.organizationId} | facts=${facts
      .map((f) => f.key)
      .join(",")} | count=${facts.length}`
  );

  return { indexed: true, factCount: facts.length };
}

/**
 * Fire-and-forget wrapper — never throws to caller.
 */
export function schedulePromptFactLearning(
  input: IndexPromptFactsInput
): void {
  void indexPromptFacts(input).catch((err) => {
    console.warn(
      `🧠 [AI OS] knowledge prompt facts failed | ${err instanceof Error ? err.message : String(err)}`
    );
  });
}
