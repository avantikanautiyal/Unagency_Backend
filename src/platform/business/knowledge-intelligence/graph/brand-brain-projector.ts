/**
 * Project Brand Brain documents into a knowledge graph.
 * Brand Brain remains source of truth — this is semantic understanding over it.
 */

import type { BrandBrainDocument } from "../../brand-brain/contracts";
import type { KnowledgeEntity, KnowledgeRelationship } from "../contracts";
import { defaultWeightFor } from "../ontology";

export interface ProjectedGraph {
  readonly entities: KnowledgeEntity[];
  readonly relationships: KnowledgeRelationship[];
}

export function projectBrandBrainToGraph(
  document: BrandBrainDocument,
  deps: {
    readonly nowIso: () => string;
    readonly createId: (prefix: string) => string;
    readonly relationshipVersion?: number;
  }
): ProjectedGraph {
  const now = deps.nowIso();
  const orgId = document.organizationId;
  const relVersion = deps.relationshipVersion ?? 1;
  const entities: KnowledgeEntity[] = [];
  const relationships: KnowledgeRelationship[] = [];

  const addEntity = (
    partial: Omit<KnowledgeEntity, "createdAt" | "updatedAt" | "organizationId">
  ): KnowledgeEntity => {
    const e: KnowledgeEntity = {
      ...partial,
      organizationId: orgId,
      createdAt: now,
      updatedAt: now,
    };
    entities.push(e);
    return e;
  };

  const addRel = (
    type: string,
    fromEntityId: string,
    toEntityId: string,
    sourceRef: string,
    weight?: number
  ): void => {
    relationships.push({
      relationshipId: deps.createId("krel"),
      organizationId: orgId,
      type,
      fromEntityId,
      toEntityId,
      weight: weight ?? defaultWeightFor(type),
      confidence: 0.92,
      attributes: { projectedFrom: "brand_brain" },
      version: relVersion,
      createdAt: now,
      changelog: `projected:${sourceRef}`,
    });
  };

  const orgEntity = addEntity({
    entityId: `ent_org_${orgId}`,
    type: "organization",
    name: document.organization.legalName,
    attributes: { ...document.organization },
    tags: ["organization", document.organization.industry],
    confidence: 1,
    sourceRefs: [`bb:org:${orgId}`],
  });

  const brandId = document.brandId ?? document.identity.brandId;
  const brandEntity = addEntity({
    entityId: `ent_brand_${brandId}`,
    type: "brand",
    name: document.identity.name,
    attributes: { ...document.identity },
    tags: ["brand", ...document.identity.values],
    confidence: 1,
    sourceRefs: [`bb:brand:${brandId}`],
  });
  addRel("has_brand", orgEntity.entityId, brandEntity.entityId, "identity");

  const toneEntity = addEntity({
    entityId: `ent_tone_${brandId}`,
    type: "tone",
    name: `${document.identity.name} Tone`,
    attributes: { ...document.tone },
    tags: [...document.tone.adjectives, "tone"],
    confidence: 0.98,
    sourceRefs: [`bb:tone:${brandId}`],
  });
  addRel("brand_has_tone", brandEntity.entityId, toneEntity.entityId, "tone");

  for (const region of document.organization.regions) {
    const regionEntity = addEntity({
      entityId: `ent_region_${orgId}_${region}`,
      type: "region",
      name: region,
      attributes: { region },
      tags: ["region", region],
      confidence: 0.95,
      sourceRefs: [`bb:region:${region}`],
    });
    addRel("located_in", orgEntity.entityId, regionEntity.entityId, "organization.regions");
    addRel("located_in", brandEntity.entityId, regionEntity.entityId, "organization.regions");
  }

  const marketEntity = addEntity({
    entityId: `ent_market_${orgId}`,
    type: "market",
    name: `${document.organization.industry} market`,
    attributes: {
      industry: document.organization.industry,
      notes: document.marketNotes,
    },
    tags: ["market", document.organization.industry],
    confidence: 0.9,
    sourceRefs: [`bb:market:${orgId}`],
  });
  addRel("located_in", brandEntity.entityId, marketEntity.entityId, "market");

  const productEntities = document.products.map((p) => {
    const e = addEntity({
      entityId: `ent_product_${p.productId}`,
      type: "product",
      name: p.name,
      attributes: { ...p },
      tags: ["product", p.category],
      confidence: 0.95,
      sourceRefs: [`bb:product:${p.productId}`],
    });
    addRel("offers_product", brandEntity.entityId, e.entityId, p.productId);
    return e;
  });

  for (const s of document.services) {
    const e = addEntity({
      entityId: `ent_service_${s.serviceId}`,
      type: "service",
      name: s.name,
      attributes: { ...s },
      tags: ["service"],
      confidence: 0.92,
      sourceRefs: [`bb:service:${s.serviceId}`],
    });
    addRel("offers_service", brandEntity.entityId, e.entityId, s.serviceId);
  }

  const audienceEntities = document.audiences.map((a) => {
    const e = addEntity({
      entityId: `ent_audience_${a.audienceId}`,
      type: "audience",
      name: a.name,
      attributes: { ...a },
      tags: ["audience", ...a.segments],
      confidence: 0.93,
      sourceRefs: [`bb:audience:${a.audienceId}`],
    });
    addRel("targets_audience", brandEntity.entityId, e.entityId, a.audienceId);
    for (const region of document.organization.regions) {
      addRel(
        "audience_in_region",
        e.entityId,
        `ent_region_${orgId}_${region}`,
        a.audienceId
      );
    }
    return e;
  });

  for (const p of document.personas) {
    const e = addEntity({
      entityId: `ent_persona_${p.personaId}`,
      type: "persona",
      name: p.name,
      attributes: { ...p },
      tags: ["persona", p.role],
      confidence: 0.9,
      sourceRefs: [`bb:persona:${p.personaId}`],
    });
    if (audienceEntities[0]) {
      addRel("has_persona", audienceEntities[0].entityId, e.entityId, p.personaId);
    }
  }

  for (const c of document.competitors) {
    const e = addEntity({
      entityId: `ent_competitor_${c.competitorId}`,
      type: "competitor",
      name: c.name,
      attributes: { ...c },
      tags: ["competitor"],
      confidence: 0.88,
      sourceRefs: [`bb:competitor:${c.competitorId}`],
    });
    addRel("differentiates_from", brandEntity.entityId, e.entityId, c.competitorId);
    addRel("competitor_in_market", e.entityId, marketEntity.entityId, c.competitorId);
  }

  for (const camp of document.campaignHistory) {
    const e = addEntity({
      entityId: `ent_campaign_${camp.campaignId}`,
      type: "campaign",
      name: camp.name,
      attributes: { ...camp },
      tags: ["campaign", camp.outcome, ...camp.channels],
      confidence: camp.outcome === "success" ? 0.95 : 0.85,
      sourceRefs: [`bb:campaign:${camp.campaignId}`],
    });
    addRel("runs_campaign", brandEntity.entityId, e.entityId, camp.campaignId);
    if (productEntities[0]) {
      addRel(
        "product_in_campaign",
        productEntities[0].entityId,
        e.entityId,
        camp.campaignId
      );
    }
    if (audienceEntities[0]) {
      addRel("campaign_targets", e.entityId, audienceEntities[0].entityId, camp.campaignId);
    }
  }

  for (const assetRef of document.assetRefs) {
    const e = addEntity({
      entityId: `ent_asset_${assetRef}`,
      type: "asset",
      name: assetRef,
      attributes: { ref: assetRef },
      tags: ["asset"],
      confidence: 0.8,
      sourceRefs: [`bb:asset:${assetRef}`],
    });
    if (document.campaignHistory[0]) {
      addRel(
        "campaign_uses_asset",
        `ent_campaign_${document.campaignHistory[0].campaignId}`,
        e.entityId,
        assetRef
      );
    }
  }

  for (const pol of document.policies) {
    const type = pol.kind === "compliance" ? "legal_rule" : "policy";
    const e = addEntity({
      entityId: `ent_policy_${pol.policyId}`,
      type,
      name: pol.title,
      attributes: { ...pol },
      tags: ["policy", pol.kind],
      confidence: 0.97,
      sourceRefs: [`bb:policy:${pol.policyId}`],
    });
    addRel("policy_governs", e.entityId, brandEntity.entityId, pol.policyId);
    if (document.campaignHistory[0]) {
      addRel(
        "legal_rule_constrains",
        e.entityId,
        `ent_campaign_${document.campaignHistory[0].campaignId}`,
        pol.policyId
      );
    }
  }

  for (const s of document.successfulStrategies) {
    const e = addEntity({
      entityId: `ent_strategy_${s.strategyId}`,
      type: "strategy",
      name: s.title,
      attributes: { ...s, outcome: "success" },
      tags: ["strategy", "success", ...s.tags],
      confidence: 0.9,
      sourceRefs: [`bb:strategy:${s.strategyId}`],
    });
    addRel("succeeds_with", brandEntity.entityId, e.entityId, s.strategyId);
  }

  for (const s of document.failedStrategies) {
    const e = addEntity({
      entityId: `ent_strategy_${s.strategyId}`,
      type: "strategy",
      name: s.title,
      attributes: { ...s, outcome: "failed" },
      tags: ["strategy", "failed", ...s.tags],
      confidence: 0.88,
      sourceRefs: [`bb:strategy:${s.strategyId}`],
    });
    addRel("fails_with", brandEntity.entityId, e.entityId, s.strategyId);
  }

  for (const g of document.goals) {
    addEntity({
      entityId: `ent_goal_${g.goalId}`,
      type: "goal",
      name: g.title,
      attributes: { ...g },
      tags: ["goal", g.priority, g.department ?? "general"],
      confidence: 0.9,
      sourceRefs: [`bb:goal:${g.goalId}`],
    });
    if (g.department) {
      const deptId = `ent_dept_${orgId}_${g.department}`;
      if (!entities.find((x) => x.entityId === deptId)) {
        addEntity({
          entityId: deptId,
          type: "department",
          name: g.department,
          attributes: { department: g.department },
          tags: ["department", g.department],
          confidence: 0.85,
          sourceRefs: [`bb:department:${g.department}`],
        });
      }
    }
  }

  return { entities, relationships };
}
