/**
 * Extensible ontology — typed entities and relationships.
 * Custom types remain allowed; catalog documents known edges.
 */

import type {
  KnowledgeEntityType,
  KnowledgeRelationshipType,
} from "../contracts";

export const CORE_ENTITY_TYPES: readonly KnowledgeEntityType[] = [
  "organization",
  "brand",
  "product",
  "service",
  "audience",
  "persona",
  "campaign",
  "asset",
  "document",
  "competitor",
  "market",
  "region",
  "department",
  "workflow",
  "policy",
  "faq",
  "support_case",
  "legal_rule",
  "landing_page",
  "website",
  "social_channel",
  "execution",
  "evaluation",
  "experience",
  "template",
  "tone",
  "strategy",
  "goal",
] as const;

export interface RelationshipCatalogEntry {
  readonly type: KnowledgeRelationshipType;
  readonly fromTypes: readonly KnowledgeEntityType[];
  readonly toTypes: readonly KnowledgeEntityType[];
  readonly description: string;
  readonly defaultWeight: number;
}

/** Known relationship shapes — examples; graph accepts extensions. */
export const RELATIONSHIP_CATALOG: readonly RelationshipCatalogEntry[] = [
  {
    type: "has_brand",
    fromTypes: ["organization"],
    toTypes: ["brand"],
    description: "Organization owns a brand",
    defaultWeight: 1,
  },
  {
    type: "offers_product",
    fromTypes: ["organization", "brand"],
    toTypes: ["product"],
    description: "Org/brand offers product",
    defaultWeight: 0.95,
  },
  {
    type: "offers_service",
    fromTypes: ["organization", "brand"],
    toTypes: ["service"],
    description: "Org/brand offers service",
    defaultWeight: 0.9,
  },
  {
    type: "product_in_campaign",
    fromTypes: ["product"],
    toTypes: ["campaign"],
    description: "Product featured in campaign",
    defaultWeight: 0.9,
  },
  {
    type: "campaign_targets",
    fromTypes: ["campaign"],
    toTypes: ["audience"],
    description: "Campaign targets audience",
    defaultWeight: 0.95,
  },
  {
    type: "audience_in_region",
    fromTypes: ["audience"],
    toTypes: ["region"],
    description: "Audience sits in region",
    defaultWeight: 0.85,
  },
  {
    type: "brand_has_tone",
    fromTypes: ["brand"],
    toTypes: ["tone"],
    description: "Brand tone of voice",
    defaultWeight: 1,
  },
  {
    type: "campaign_uses_asset",
    fromTypes: ["campaign"],
    toTypes: ["asset"],
    description: "Campaign uses asset",
    defaultWeight: 0.8,
  },
  {
    type: "product_has_faq",
    fromTypes: ["product"],
    toTypes: ["faq"],
    description: "Product FAQ",
    defaultWeight: 0.75,
  },
  {
    type: "competitor_in_market",
    fromTypes: ["competitor"],
    toTypes: ["market"],
    description: "Competitor competes in market",
    defaultWeight: 0.85,
  },
  {
    type: "landing_page_for",
    fromTypes: ["landing_page"],
    toTypes: ["product"],
    description: "Landing page promotes product",
    defaultWeight: 0.8,
  },
  {
    type: "support_case_about",
    fromTypes: ["support_case"],
    toTypes: ["product"],
    description: "Support case about product",
    defaultWeight: 0.7,
  },
  {
    type: "legal_rule_constrains",
    fromTypes: ["legal_rule", "policy"],
    toTypes: ["campaign", "brand", "product"],
    description: "Legal/policy constrains marketing entity",
    defaultWeight: 1,
  },
  {
    type: "execution_evaluated_by",
    fromTypes: ["execution"],
    toTypes: ["evaluation"],
    description: "Execution has evaluation",
    defaultWeight: 0.9,
  },
  {
    type: "execution_yielded_experience",
    fromTypes: ["execution"],
    toTypes: ["experience"],
    description: "Execution produced experience",
    defaultWeight: 0.85,
  },
  {
    type: "targets_audience",
    fromTypes: ["brand", "product", "campaign"],
    toTypes: ["audience"],
    description: "Entity targets audience",
    defaultWeight: 0.9,
  },
  {
    type: "differentiates_from",
    fromTypes: ["brand", "product"],
    toTypes: ["competitor"],
    description: "Differentiation edge",
    defaultWeight: 0.8,
  },
  {
    type: "succeeds_with",
    fromTypes: ["brand", "campaign"],
    toTypes: ["strategy"],
    description: "Successful strategy link",
    defaultWeight: 0.85,
  },
  {
    type: "fails_with",
    fromTypes: ["brand", "campaign"],
    toTypes: ["strategy"],
    description: "Failed strategy link",
    defaultWeight: 0.8,
  },
  {
    type: "policy_governs",
    fromTypes: ["policy"],
    toTypes: ["campaign", "brand", "product"],
    description: "Policy governance",
    defaultWeight: 0.95,
  },
  {
    type: "located_in",
    fromTypes: ["organization", "brand", "audience"],
    toTypes: ["region", "market"],
    description: "Geographic placement",
    defaultWeight: 0.8,
  },
];

export function defaultWeightFor(
  type: KnowledgeRelationshipType
): number {
  const hit = RELATIONSHIP_CATALOG.find((e) => e.type === type);
  return hit?.defaultWeight ?? 0.7;
}

export function isCoreEntityType(type: string): boolean {
  return (CORE_ENTITY_TYPES as readonly string[]).includes(type);
}
