/**
 * Canonical agent taxonomy hierarchy.
 */

export interface AgentTaxonomyNode {
  readonly id: string;
  readonly role: string;
  readonly department: string;
  readonly children?: readonly AgentTaxonomyNode[];
}

export const AGENT_TAXONOMY: readonly AgentTaxonomyNode[] = [
  {
    id: "marketing",
    role: "Marketing",
    department: "marketing",
    children: [
      { id: "research_agent", role: "Research Agent", department: "marketing" },
      { id: "campaign_strategist", role: "Campaign Strategist", department: "marketing" },
      { id: "copywriter", role: "Copywriter", department: "marketing" },
      { id: "seo_specialist", role: "SEO Specialist", department: "marketing" },
      { id: "brand_specialist", role: "Brand Specialist", department: "marketing" },
      { id: "creative_director", role: "Creative Director", department: "marketing" },
      { id: "media_planner", role: "Media Planner", department: "marketing" },
      { id: "content_planner", role: "Content Planner", department: "marketing" },
      { id: "audience_strategist", role: "Audience Strategist", department: "marketing" },
      { id: "performance_analyst", role: "Performance Analyst", department: "marketing" },
    ],
  },
  {
    id: "software_engineering",
    role: "Software Engineering",
    department: "software_engineering",
    children: [
      { id: "solution_architect", role: "Solution Architect", department: "software_engineering" },
      { id: "backend_engineer", role: "Backend Engineer", department: "software_engineering" },
      { id: "frontend_engineer", role: "Frontend Engineer", department: "software_engineering" },
      { id: "mobile_engineer", role: "Mobile Engineer", department: "software_engineering" },
      { id: "database_engineer", role: "Database Engineer", department: "software_engineering" },
      { id: "devops_engineer", role: "DevOps Engineer", department: "software_engineering" },
      { id: "security_engineer", role: "Security Engineer", department: "software_engineering" },
      { id: "qa_engineer", role: "QA Engineer", department: "software_engineering" },
      { id: "technical_writer", role: "Technical Writer", department: "software_engineering" },
    ],
  },
  {
    id: "design",
    role: "Design",
    department: "design",
    children: [
      { id: "brand_designer", role: "Brand Designer", department: "design" },
      { id: "ui_designer", role: "UI Designer", department: "design" },
      { id: "ux_researcher", role: "UX Researcher", department: "design" },
      { id: "illustrator", role: "Illustrator", department: "design" },
      { id: "motion_designer", role: "Motion Designer", department: "design" },
      { id: "video_editor", role: "Video Editor", department: "design" },
    ],
  },
  {
    id: "business",
    role: "Business",
    department: "business",
    children: [
      { id: "business_analyst", role: "Business Analyst", department: "business" },
      { id: "product_manager", role: "Product Manager", department: "business" },
      { id: "project_manager", role: "Project Manager", department: "business" },
      { id: "financial_analyst", role: "Financial Analyst", department: "business" },
      { id: "legal_reviewer", role: "Legal Reviewer", department: "business" },
      { id: "hr_advisor", role: "HR Advisor", department: "business" },
      { id: "customer_success", role: "Customer Success", department: "business" },
    ],
  },
  {
    id: "research",
    role: "Research",
    department: "research",
    children: [
      { id: "competitive_intelligence", role: "Competitive Intelligence", department: "research" },
      { id: "market_research", role: "Market Research Analyst", department: "research" },
      { id: "academic_research", role: "Academic Research", department: "research" },
      { id: "trend_analyst", role: "Trend Analyst", department: "research" },
      { id: "data_analyst", role: "Data Analyst", department: "research" },
    ],
  },
];

export function flattenRoles(nodes: readonly AgentTaxonomyNode[] = AGENT_TAXONOMY): string[] {
  const roles: string[] = [];
  for (const n of nodes) {
    if (n.children) {
      for (const c of n.children) roles.push(c.role);
    }
  }
  return roles;
}
