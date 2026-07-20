/**
 * Client playbook seed data — versioned workflow library.
 */

import { asPlaybookId } from "../contracts/identifiers";
import type { ClientPlaybook } from "../contracts/playbook";

export const RETAIL_PRODUCT_LAUNCH_PLAYBOOK: ClientPlaybook = {
  playbookId: asPlaybookId("playbook_retail_product_launch"),
  name: "Retail Product Launch",
  version: "1.0.0",
  industry: "retail",
  scenarioKeywords: ["launch", "collection", "product", "sneaker", "retail", "new"],
  description: "Full product launch workflow for retail clients",
  tasks: [
    { templateId: "t1", title: "Market Research", description: "Analyze market landscape", capabilityId: "research.market.analysis", dependsOn: [], stage: 1, requiresReview: false, optional: false },
    { templateId: "t2", title: "Audience Analysis", description: "Define target audience segments", capabilityId: "research.audience.analysis", dependsOn: ["t1"], stage: 1, requiresReview: false, optional: false },
    { templateId: "t3", title: "Brand Review", description: "Align with brand guidelines", capabilityId: "branding.review", dependsOn: ["t1"], stage: 1, parallelGroup: "research", requiresReview: true, optional: false },
    { templateId: "t4", title: "Campaign Strategy", description: "Define campaign approach", capabilityId: "campaign.strategy", dependsOn: ["t1", "t2", "t3"], stage: 2, requiresReview: true, optional: false },
    { templateId: "t5", title: "Content Calendar", description: "Plan content schedule", capabilityId: "content.calendar", dependsOn: ["t4"], stage: 2, requiresReview: false, optional: false },
    { templateId: "t6", title: "Instagram Carousel", description: "Create carousel creative", capabilityId: "marketing.social.carousel", dependsOn: ["t4", "t5"], stage: 3, parallelGroup: "social", requiresReview: true, optional: false },
    { templateId: "t7", title: "Instagram Reel", description: "Create reel content", capabilityId: "marketing.social.reel", dependsOn: ["t4", "t5"], stage: 3, parallelGroup: "social", requiresReview: true, optional: false },
    { templateId: "t8", title: "Facebook Ads", description: "Facebook ad creatives", capabilityId: "marketing.ads.facebook", dependsOn: ["t4"], stage: 3, parallelGroup: "paid", requiresReview: true, optional: false },
    { templateId: "t9", title: "Google Ads", description: "Google ad campaigns", capabilityId: "marketing.ads.google", dependsOn: ["t4"], stage: 3, parallelGroup: "paid", requiresReview: true, optional: false },
    { templateId: "t10", title: "Email Campaign", description: "Email launch sequence", capabilityId: "marketing.email.campaign", dependsOn: ["t4", "t5"], stage: 3, requiresReview: true, optional: false },
    { templateId: "t11", title: "Landing Page Copy", description: "Landing page content", capabilityId: "marketing.landing.copy", dependsOn: ["t4"], stage: 3, requiresReview: true, optional: false },
    { templateId: "t12", title: "SEO Metadata", description: "SEO titles and descriptions", capabilityId: "seo.metadata", dependsOn: ["t11"], stage: 4, requiresReview: false, optional: false },
    { templateId: "t13", title: "Performance KPI Plan", description: "Define success metrics", capabilityId: "marketing.kpi.plan", dependsOn: ["t4"], stage: 4, requiresReview: true, optional: false },
  ],
  deliverables: ["Instagram Carousel", "Instagram Reel", "Ad Creatives", "Email Sequence", "Landing Page", "SEO Metadata", "KPI Plan"],
};

export const REAL_ESTATE_PLAYBOOK: ClientPlaybook = {
  playbookId: asPlaybookId("playbook_real_estate"),
  name: "Real Estate Marketing",
  version: "1.0.0",
  industry: "real_estate",
  scenarioKeywords: ["property", "listing", "real estate", "brochure", "whatsapp"],
  description: "Property marketing workflow",
  tasks: [
    { templateId: "re1", title: "Brochure Copy", description: "Property brochure content", capabilityId: "marketing.landing.copy", dependsOn: [], stage: 1, requiresReview: true, optional: false },
    { templateId: "re2", title: "Listing Description", description: "Online listing copy", capabilityId: "marketing.seo.blog", dependsOn: ["re1"], stage: 1, requiresReview: false, optional: false },
    { templateId: "re3", title: "Ad Creatives", description: "Paid ad content", capabilityId: "marketing.social.ad_copy", dependsOn: ["re1"], stage: 2, parallelGroup: "ads", requiresReview: true, optional: false },
    { templateId: "re4", title: "WhatsApp Campaign", description: "WhatsApp outreach copy", capabilityId: "marketing.email.campaign", dependsOn: ["re2"], stage: 2, requiresReview: true, optional: false },
    { templateId: "re5", title: "Landing Page", description: "Property landing page", capabilityId: "marketing.landing.copy", dependsOn: ["re2"], stage: 3, requiresReview: true, optional: false },
  ],
  deliverables: ["Brochure", "Listing", "Ad Creatives", "WhatsApp Campaign", "Landing Page"],
};

export const SOFTWARE_COMPANY_PLAYBOOK: ClientPlaybook = {
  playbookId: asPlaybookId("playbook_software_company"),
  name: "Software Product Workflow",
  version: "1.0.0",
  industry: "software",
  scenarioKeywords: ["software", "prd", "api", "sprint", "wireframe", "release"],
  description: "Software company product workflow",
  tasks: [
    { templateId: "sw1", title: "PRD", description: "Product requirements document", capabilityId: "research.market.analysis", dependsOn: [], stage: 1, requiresReview: true, optional: false },
    { templateId: "sw2", title: "Wireframes", description: "UI wireframes", capabilityId: "design.ui", dependsOn: ["sw1"], stage: 1, requiresReview: true, optional: false },
    { templateId: "sw3", title: "API Documentation", description: "API docs", capabilityId: "coding.backend.node", dependsOn: ["sw1"], stage: 2, requiresReview: true, optional: false },
    { templateId: "sw4", title: "Sprint Planning", description: "Sprint plan", capabilityId: "campaign.strategy", dependsOn: ["sw1", "sw2"], stage: 2, requiresReview: true, optional: false },
    { templateId: "sw5", title: "UI Copy", description: "Interface copy", capabilityId: "marketing.landing.copy", dependsOn: ["sw2"], stage: 3, requiresReview: false, optional: false },
    { templateId: "sw6", title: "Release Notes", description: "Release documentation", capabilityId: "marketing.blog", dependsOn: ["sw4"], stage: 3, requiresReview: true, optional: false },
  ],
  deliverables: ["PRD", "Wireframes", "API Docs", "Sprint Plan", "UI Copy", "Release Notes"],
};

export const DEFAULT_PLAYBOOKS: readonly ClientPlaybook[] = [
  RETAIL_PRODUCT_LAUNCH_PLAYBOOK,
  REAL_ESTATE_PLAYBOOK,
  SOFTWARE_COMPANY_PLAYBOOK,
];
