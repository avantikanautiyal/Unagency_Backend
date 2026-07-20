/**
 * Team playbook seed data.
 */

import { asTeamPlaybookId } from "../contracts/identifiers";
import type { TeamPlaybook } from "../contracts/playbook";

export const MARKETING_CAMPAIGN_TEAM: TeamPlaybook = {
  playbookId: asTeamPlaybookId("team_marketing_campaign"),
  name: "Marketing Campaign Team",
  kind: "marketing_campaign",
  version: "1.0.0",
  scenarioKeywords: ["launch", "campaign", "collection", "sneaker", "product"],
  coordinationStrategy: "pipeline",
  description: "Full marketing campaign team for product launches",
  roles: [
    { role: "Market Research Analyst", department: "research", responsibilities: ["Market analysis"], optional: false },
    { role: "Audience Strategist", department: "marketing", responsibilities: ["Audience segmentation"], optional: false },
    { role: "Brand Specialist", department: "marketing", responsibilities: ["Brand alignment"], optional: false },
    { role: "Campaign Strategist", department: "marketing", responsibilities: ["Campaign planning"], optional: false },
    { role: "Content Planner", department: "marketing", responsibilities: ["Content calendar"], optional: false },
    { role: "Copywriter", department: "marketing", responsibilities: ["Copy creation"], optional: false },
    { role: "Creative Director", department: "marketing", responsibilities: ["Creative oversight"], optional: false },
    { role: "SEO Specialist", department: "marketing", responsibilities: ["SEO optimization"], optional: false },
    { role: "Performance Analyst", department: "marketing", responsibilities: ["KPI planning"], optional: false },
    { role: "QA Reviewer", department: "marketing", responsibilities: ["Quality review"], optional: false },
    { role: "Human Approval", department: "business", responsibilities: ["Final approval"], optional: false },
  ],
};

export const PRODUCT_LAUNCH_TEAM: TeamPlaybook = {
  ...MARKETING_CAMPAIGN_TEAM,
  playbookId: asTeamPlaybookId("team_product_launch"),
  name: "Product Launch Team",
  kind: "product_launch",
};

export const DEFAULT_TEAM_PLAYBOOKS: readonly TeamPlaybook[] = [
  MARKETING_CAMPAIGN_TEAM,
  PRODUCT_LAUNCH_TEAM,
];
