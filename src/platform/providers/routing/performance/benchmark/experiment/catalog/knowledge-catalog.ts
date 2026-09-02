/**
 * Step 9 — Knowledge context catalog (references, not a second knowledge repository).
 */

import { createHash } from "crypto";
import type { KnowledgeContextRef } from "../contracts/knowledge-context";

function fingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export const DEFAULT_KNOWLEDGE_CONTEXTS: readonly KnowledgeContextRef[] = Object.freeze([
  Object.freeze({
    knowledgeId: "knowledge.generic",
    knowledgeVersion: "1.0.0",
    scope: "generic" as const,
    label: "Generic creative guidance",
    sourceReferences: Object.freeze(["internal://knowledge/generic-creative-v1"]),
    contentFingerprint: fingerprint("generic-creative-guidance-v1"),
    contentPreview:
      "Apply professional agency standards. Ground outputs in the client brief. Prefer measurable, contract-valid deliverables.",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: Object.freeze({}),
  }),
  Object.freeze({
    knowledgeId: "knowledge.fashion",
    knowledgeVersion: "3.0.0",
    scope: "industry" as const,
    label: "Fashion industry context",
    sourceReferences: Object.freeze(["internal://knowledge/fashion-v3"]),
    contentFingerprint: fingerprint("fashion-industry-v3"),
    contentPreview:
      "Fashion industry: emphasize brand story, seasonal relevance, visual hierarchy, and premium positioning. Reference target demographic and category norms.",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: Object.freeze({ industries: Object.freeze(["fashion", "retail"]) }),
  }),
  Object.freeze({
    knowledgeId: "knowledge.social_copy",
    knowledgeVersion: "1.0.0",
    scope: "service" as const,
    label: "Social copywriting guidance",
    sourceReferences: Object.freeze(["internal://knowledge/social-copy-v1"]),
    contentFingerprint: fingerprint("social-copy-v1"),
    contentPreview:
      "Social copy: platform-native tone, hook-first structure, clear CTA, brand voice consistency. Avoid generic filler.",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: Object.freeze({
      services: Object.freeze(["social"]),
      outputKinds: Object.freeze(["text"]),
    }),
  }),
  Object.freeze({
    knowledgeId: "knowledge.seo_irrelevant_image",
    knowledgeVersion: "1.0.0",
    scope: "task_specific" as const,
    label: "SEO text guidance (text-only)",
    sourceReferences: Object.freeze(["internal://knowledge/seo-text-v1"]),
    contentFingerprint: fingerprint("seo-text-v1"),
    contentPreview: "SEO: keyword intent, search-friendly headings, meta descriptions, semantic structure.",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: Object.freeze({
      services: Object.freeze(["social", "website"]),
      outputKinds: Object.freeze(["text", "deferred_website"]),
    }),
  }),
]);

const knowledgeIndex = new Map<string, KnowledgeContextRef>(
  DEFAULT_KNOWLEDGE_CONTEXTS.map((k) => [`${k.knowledgeId}@${k.knowledgeVersion}`, k]),
);

export function getKnowledgeContext(
  knowledgeId: string,
  knowledgeVersion = "1.0.0",
): KnowledgeContextRef | undefined {
  return knowledgeIndex.get(`${knowledgeId}@${knowledgeVersion}`);
}

export function listKnowledgeContexts(): readonly KnowledgeContextRef[] {
  return DEFAULT_KNOWLEDGE_CONTEXTS;
}

export function registerKnowledgeContext(ref: KnowledgeContextRef): void {
  knowledgeIndex.set(`${ref.knowledgeId}@${ref.knowledgeVersion}`, Object.freeze(ref));
}

export function buildKnowledgeContextRef(input: {
  readonly knowledgeId: string;
  readonly knowledgeVersion: string;
  readonly scope: KnowledgeContextRef["scope"];
  readonly contentPreview: string;
  readonly sourceReferences?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}): KnowledgeContextRef {
  return Object.freeze({
    knowledgeId: input.knowledgeId,
    knowledgeVersion: input.knowledgeVersion,
    scope: input.scope,
    sourceReferences: Object.freeze(input.sourceReferences ?? []),
    contentFingerprint: fingerprint(input.contentPreview),
    contentPreview: input.contentPreview,
    createdAt: new Date().toISOString(),
    metadata: input.metadata,
  });
}
