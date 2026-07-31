/**
 * Assemble structured knowledge context from graph traversal + ranking.
 * Never generates prompts. Never returns raw documents.
 */

import type {
  KnowledgeContextFact,
  KnowledgeContextPackage,
  KnowledgeEntity,
  KnowledgeExplainabilityItem,
  KnowledgeRelationship,
  KnowledgeRetrievalQuery,
} from "../contracts";
import { relatedVia, shortestPath } from "../reasoning/traverse";
import {
  confidenceBand,
  rankFacts,
  scoreEntityMatch,
} from "../ranking/rank-evidence";

export function assembleKnowledgeContext(input: {
  readonly query: KnowledgeRetrievalQuery;
  readonly entities: Map<string, KnowledgeEntity>;
  readonly relationships: readonly KnowledgeRelationship[];
  readonly graphVersion: number;
  readonly snapshotId: string;
  readonly brandBrainVersion?: number;
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
}): KnowledgeContextPackage {
  const q = input.query;
  const maxDepth = q.maxDepth ?? 2;
  const maxFacts = q.maxFacts ?? 40;
  const hints = [
    q.capabilityId,
    q.department,
    q.region,
    q.market,
    q.campaignId,
    q.productId,
    q.audienceId,
  ].filter((x): x is string => Boolean(x));

  const seeds = resolveSeeds(q, input.entities);
  const facts: KnowledgeContextFact[] = [];
  const explainability: KnowledgeExplainabilityItem[] = [];
  const relatedIds = new Set<string>();
  const relTypesUsed = new Set<string>();

  for (const seed of seeds) {
    relatedIds.add(seed.entityId);
    const entityScore = scoreEntityMatch(seed.tags, hints) + 0.35;
    pushEntityFact(seed, entityScore, "seed entity for query", facts, explainability, input.createId);

    const { entityIds, used } = relatedVia(seed.entityId, input.relationships, {
      maxDepth,
      relationshipTypes: q.preferRelationshipTypes,
    });

    for (const r of used) {
      relTypesUsed.add(r.type);
      const otherId = r.fromEntityId === seed.entityId ? r.toEntityId : r.fromEntityId;
      const other = input.entities.get(otherId);
      if (!other) continue;
      relatedIds.add(other.entityId);

      const relScore =
        r.weight * 0.7 + scoreEntityMatch(other.tags, hints) * 0.3 + depthBoost(seed.entityId, other.entityId, used);
      pushRelationshipFact(r, seed, other, relScore, facts, explainability, input.createId);

      const path = shortestPath(seed.entityId, other.entityId, input.relationships);
      if (path && path.length > 0) {
        pushPathFact(path, seed, other, relScore * 0.95, facts, explainability, input.createId);
      }
    }

    for (const id of entityIds) {
      const e = input.entities.get(id);
      if (!e) continue;
      relatedIds.add(e.entityId);
      const score =
        scoreEntityMatch(e.tags, hints) + depthBoost(seed.entityId, e.entityId, used) + queryBoost(e, q);
      pushEntityFact(e, score, "neighborhood expansion", facts, explainability, input.createId);
    }
  }

  // Deduplicate by key+entity, keep highest score
  const dedup = new Map<string, KnowledgeContextFact>();
  const whyByFact = new Map<string, KnowledgeExplainabilityItem>();
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i]!;
    const k = `${f.kind}:${f.entityId ?? ""}:${f.relationshipId ?? ""}:${f.key}`;
    const prev = dedup.get(k);
    if (!prev || f.score > prev.score) {
      dedup.set(k, f);
      whyByFact.set(f.factId, explainability[i]!);
    }
  }

  const ranked = rankFacts([...dedup.values()], maxFacts);
  const rankedExplain = ranked.map((f) => {
    const existing = whyByFact.get(f.factId);
    return (
      existing ?? {
        factId: f.factId,
        whySelected: "Ranked by evidence score",
        traversalSummary: f.kind,
        score: f.score,
        confidence: f.confidence,
        relationshipTypesUsed: [],
      }
    );
  });

  const avgConf =
    ranked.length === 0
      ? 0
      : ranked.reduce((s, f) => s + f.confidence, 0) / ranked.length;
  const avgScore =
    ranked.length === 0 ? 0 : ranked.reduce((s, f) => s + f.score, 0) / ranked.length;

  return {
    contextId: input.createId("kctx"),
    organizationId: q.organizationId,
    graphVersion: input.graphVersion,
    snapshotId: input.snapshotId,
    brandBrainVersion: input.brandBrainVersion,
    retrievedAt: input.nowIso(),
    query: q,
    facts: ranked,
    relatedEntityIds: [...relatedIds],
    explainability: rankedExplain,
    summary: {
      factCount: ranked.length,
      entityCount: relatedIds.size,
      relationshipEvidenceCount: ranked.filter((f) => f.kind === "relationship" || f.kind === "path")
        .length,
      averageConfidence: Number(avgConf.toFixed(4)),
      averageScore: Number(avgScore.toFixed(4)),
    },
  };
}

export function contextToExecutionMetadata(
  pack: KnowledgeContextPackage
): Readonly<Record<string, unknown>> {
  return {
    knowledgeIntelligence: {
      contextId: pack.contextId,
      organizationId: pack.organizationId,
      graphVersion: pack.graphVersion,
      brandBrainVersion: pack.brandBrainVersion,
      facts: pack.facts,
      relatedEntityIds: pack.relatedEntityIds,
      explainability: pack.explainability,
      summary: pack.summary,
      containsRawDocuments: false,
      containsGeneratedPrompts: false,
      containsLlmReasoning: false,
    },
  };
}

function resolveSeeds(
  q: KnowledgeRetrievalQuery,
  entities: Map<string, KnowledgeEntity>
): KnowledgeEntity[] {
  const seeds: KnowledgeEntity[] = [];
  if (q.seedEntityIds?.length) {
    for (const id of q.seedEntityIds) {
      const e = entities.get(id);
      if (e) seeds.push(e);
    }
  }
  if (q.productId) {
    const e = entities.get(`ent_product_${q.productId}`);
    if (e) seeds.push(e);
  }
  if (q.campaignId) {
    const e = entities.get(`ent_campaign_${q.campaignId}`);
    if (e) seeds.push(e);
  }
  if (q.audienceId) {
    const e = entities.get(`ent_audience_${q.audienceId}`);
    if (e) seeds.push(e);
  }
  if (q.seedTypes?.length) {
    for (const e of entities.values()) {
      if (q.seedTypes.includes(e.type)) seeds.push(e);
    }
  }
  if (!seeds.length) {
    for (const e of entities.values()) {
      if (e.type === "brand" || e.type === "organization") seeds.push(e);
    }
  }
  // unique
  const seen = new Set<string>();
  return seeds.filter((e) => {
    if (seen.has(e.entityId)) return false;
    seen.add(e.entityId);
    return true;
  });
}

function queryBoost(e: KnowledgeEntity, q: KnowledgeRetrievalQuery): number {
  const tags = e.tags ?? [];
  let b = 0;
  if (q.region && (tags.includes(q.region) || e.name === q.region)) b += 0.25;
  if (q.market && e.type === "market") b += 0.2;
  if (q.department && tags.includes(q.department)) b += 0.2;
  if (q.capabilityId && tags.some((t) => q.capabilityId!.includes(t))) b += 0.1;
  return b;
}

function depthBoost(
  seedId: string,
  otherId: string,
  used: readonly KnowledgeRelationship[] | undefined
): number {
  const direct = (used ?? []).some(
    (r) =>
      (r.fromEntityId === seedId && r.toEntityId === otherId) ||
      (r.toEntityId === seedId && r.fromEntityId === otherId)
  );
  return direct ? 0.2 : 0.05;
}

function pushEntityFact(
  e: KnowledgeEntity,
  score: number,
  why: string,
  facts: KnowledgeContextFact[],
  explainability: KnowledgeExplainabilityItem[],
  createId: (p: string) => string
): void {
  const factId = createId("kfact");
  facts.push({
    factId,
    kind: "entity_attribute",
    entityId: e.entityId,
    key: `${e.type}.profile`,
    value: {
      name: e.name,
      type: e.type,
      attributes: e.attributes,
      tags: e.tags,
    },
    score: Number(Math.min(1.5, score).toFixed(4)),
    confidence: e.confidence,
    confidenceBand: confidenceBand(e.confidence),
    sourceRefs: e.sourceRefs,
  });
  explainability.push({
    factId,
    whySelected: why,
    traversalSummary: `entity:${e.type}:${e.entityId}`,
    score: Number(Math.min(1.5, score).toFixed(4)),
    confidence: e.confidence,
    relationshipTypesUsed: [],
  });
}

function pushRelationshipFact(
  r: KnowledgeRelationship,
  from: KnowledgeEntity,
  to: KnowledgeEntity,
  score: number,
  facts: KnowledgeContextFact[],
  explainability: KnowledgeExplainabilityItem[],
  createId: (p: string) => string
): void {
  const factId = createId("kfact");
  facts.push({
    factId,
    kind: "relationship",
    entityId: to.entityId,
    relationshipId: r.relationshipId,
    key: `rel.${r.type}`,
    value: {
      type: r.type,
      from: { id: from.entityId, name: from.name, type: from.type },
      to: { id: to.entityId, name: to.name, type: to.type },
      weight: r.weight,
      relationshipVersion: r.version,
    },
    score: Number(Math.min(1.5, score).toFixed(4)),
    confidence: r.confidence,
    confidenceBand: confidenceBand(r.confidence),
    sourceRefs: [`rel:${r.relationshipId}`, ...from.sourceRefs, ...to.sourceRefs],
  });
  explainability.push({
    factId,
    whySelected: `Connected via ${r.type} (weight ${r.weight})`,
    traversalSummary: `${from.entityId} -[${r.type}]-> ${to.entityId}`,
    score: Number(Math.min(1.5, score).toFixed(4)),
    confidence: r.confidence,
    relationshipTypesUsed: [r.type],
  });
}

function pushPathFact(
  path: NonNullable<ReturnType<typeof shortestPath>>,
  from: KnowledgeEntity,
  to: KnowledgeEntity,
  score: number,
  facts: KnowledgeContextFact[],
  explainability: KnowledgeExplainabilityItem[],
  createId: (p: string) => string
): void {
  const factId = createId("kfact");
  const types = path.hops.map((h) => h.relationshipType);
  facts.push({
    factId,
    kind: "path",
    entityId: to.entityId,
    path,
    key: `path.${from.entityId}.${to.entityId}`,
    value: {
      from: from.entityId,
      to: to.entityId,
      length: path.length,
      hops: path.hops.map((h) => ({
        type: h.relationshipType,
        from: h.fromEntityId,
        to: h.toEntityId,
      })),
    },
    score: Number(Math.min(1.5, score).toFixed(4)),
    confidence: Math.min(...path.hops.map((h) => h.weight), from.confidence, to.confidence),
    confidenceBand: confidenceBand(from.confidence),
    sourceRefs: path.hops.map((h) => `rel:${h.relationshipId}`),
  });
  explainability.push({
    factId,
    whySelected: `Shortest path length ${path.length} linking ${from.name} to ${to.name}`,
    traversalSummary: types.join(" → "),
    score: Number(Math.min(1.5, score).toFixed(4)),
    confidence: from.confidence,
    relationshipTypesUsed: types,
  });
}
