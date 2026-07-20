/**
 * Knowledge Intelligence enums — extensible ontology vocabulary.
 */

export type KnowledgeEntityType =
  | "organization"
  | "brand"
  | "product"
  | "service"
  | "audience"
  | "persona"
  | "campaign"
  | "asset"
  | "document"
  | "competitor"
  | "market"
  | "region"
  | "department"
  | "workflow"
  | "policy"
  | "faq"
  | "support_case"
  | "legal_rule"
  | "landing_page"
  | "website"
  | "social_channel"
  | "execution"
  | "evaluation"
  | "experience"
  | "template"
  | "tone"
  | "strategy"
  | "goal"
  | string;

export type KnowledgeRelationshipType =
  | "owns"
  | "has_brand"
  | "offers_product"
  | "offers_service"
  | "targets_audience"
  | "has_persona"
  | "runs_campaign"
  | "campaign_targets"
  | "audience_in_region"
  | "brand_has_tone"
  | "product_in_campaign"
  | "campaign_uses_asset"
  | "product_has_faq"
  | "competitor_in_market"
  | "landing_page_for"
  | "support_case_about"
  | "legal_rule_constrains"
  | "policy_governs"
  | "execution_evaluated_by"
  | "execution_yielded_experience"
  | "related_to"
  | "located_in"
  | "succeeds_with"
  | "fails_with"
  | "differentiates_from"
  | string;

export type KnowledgeConfidenceBand = "high" | "medium" | "low";

export type KnowledgeEvidenceKind =
  | "entity_attribute"
  | "relationship"
  | "path"
  | "neighborhood"
  | "brand_brain_projection";
