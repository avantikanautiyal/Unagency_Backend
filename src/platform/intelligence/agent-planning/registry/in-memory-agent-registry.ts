/**
 * Agent role registry — canonical agent profiles.
 */

import { asCapabilityId } from "../../shared/identifiers";
import { asAgentId } from "../contracts/identifiers";
import type { AgentRoleProfile } from "../contracts/agent-profile";
import type { IAgentRegistry } from "../interfaces/agent-planning";
import { success, failure, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";

const CAPABILITY_ROLE_MAP: Record<string, { role: string; fallbacks: string[] }> = {
  "research.market.analysis": { role: "Market Research Analyst", fallbacks: ["Research Agent", "Competitive Intelligence"] },
  "research.audience.analysis": { role: "Audience Strategist", fallbacks: ["Research Agent", "Data Analyst"] },
  "research.competitor.analysis": { role: "Competitive Intelligence", fallbacks: ["Market Research Analyst"] },
  "branding.review": { role: "Brand Specialist", fallbacks: ["Creative Director", "Brand Designer"] },
  "branding.strategy": { role: "Brand Specialist", fallbacks: ["Campaign Strategist"] },
  "campaign.strategy": { role: "Campaign Strategist", fallbacks: ["Media Planner", "Content Planner"] },
  "content.calendar": { role: "Content Planner", fallbacks: ["Media Planner"] },
  "marketing.social.carousel": { role: "Copywriter", fallbacks: ["Creative Director", "Brand Specialist"] },
  "marketing.social.reel": { role: "Creative Director", fallbacks: ["Copywriter", "Motion Designer"] },
  "marketing.ads.facebook": { role: "Media Planner", fallbacks: ["Copywriter"] },
  "marketing.ads.google": { role: "Media Planner", fallbacks: ["SEO Specialist"] },
  "marketing.email.campaign": { role: "Copywriter", fallbacks: ["Content Planner"] },
  "marketing.landing.copy": { role: "Copywriter", fallbacks: ["SEO Specialist"] },
  "seo.metadata": { role: "SEO Specialist", fallbacks: ["Copywriter"] },
  "marketing.kpi.plan": { role: "Performance Analyst", fallbacks: ["Data Analyst", "Campaign Strategist"] },
  "coding.backend.node": { role: "Backend Engineer", fallbacks: ["Solution Architect"] },
  "coding.frontend.react": { role: "Frontend Engineer", fallbacks: ["UI Designer"] },
  "design.ui": { role: "UI Designer", fallbacks: ["UX Researcher"] },
};

function buildProfile(role: string, department: string, caps: string[]): AgentRoleProfile {
  return {
    agentId: asAgentId(role.toLowerCase().replace(/\s+/g, "_")),
    role,
    department: department as AgentRoleProfile["department"],
    capabilities: caps.map((c) => asCapabilityId(c)),
    supportedTaskTypes: ["creative", "analytical", "strategic"],
    preferredDeliverables: [],
    complexityRange: "enterprise",
    parallelExecutionSupport: !role.includes("QA") && !role.includes("Review"),
    reviewAuthority: role.includes("Director") || role.includes("QA") ? "lead" : "peer",
    dependencies: [],
    communicationRules: ["exchange artifacts only", "no raw prompt sharing"],
    preferredModelCharacteristics: ["high quality writing", "brand consistency"],
  };
}

const PROFILES: AgentRoleProfile[] = Object.entries(CAPABILITY_ROLE_MAP).map(([cap, { role }]) => {
  const dept = role.includes("Engineer") || role.includes("Architect")
    ? "software_engineering"
    : role.includes("Designer") || role.includes("Editor")
      ? "design"
      : role.includes("Analyst") || role.includes("Intelligence") || role.includes("Research")
        ? "research"
        : "marketing";
  return buildProfile(role, dept, [cap]);
});

// Add QA and Human Review profiles
PROFILES.push(
  buildProfile("QA Reviewer", "marketing", []),
  buildProfile("Human Approval", "business", [])
);

export class InMemoryAgentRegistry implements IAgentRegistry {
  constructor(private readonly profiles: readonly AgentRoleProfile[] = PROFILES) {}

  list(): Result<readonly AgentRoleProfile[]> {
    return success(this.profiles);
  }

  get(role: string): Result<AgentRoleProfile> {
    const found = this.profiles.find((p) => p.role === role);
    if (!found) return failure(new NotFoundError(`agent role not found: ${role}`));
    return success(found);
  }

  findByCapability(capabilityId: string): Result<readonly AgentRoleProfile[]> {
    const matches = this.profiles.filter((p) =>
      p.capabilities.some((c) => String(c) === capabilityId)
    );
    return success(matches);
  }
}

export function getRoleForCapability(capabilityId: string): { role: string; fallbacks: string[] } {
  return (
    CAPABILITY_ROLE_MAP[capabilityId] ?? {
      role: "Copywriter",
      fallbacks: ["Content Planner", "Campaign Strategist"],
    }
  );
}

export function getRoleForTaskTitle(title: string): { role: string; fallbacks: string[] } {
  const t = title.toLowerCase();
  if (t.includes("market research")) return { role: "Market Research Analyst", fallbacks: ["Research Agent"] };
  if (t.includes("audience")) return { role: "Audience Strategist", fallbacks: ["Research Agent"] };
  if (t.includes("brand")) return { role: "Brand Specialist", fallbacks: ["Creative Director"] };
  if (t.includes("campaign strategy")) return { role: "Campaign Strategist", fallbacks: ["Media Planner"] };
  if (t.includes("content calendar")) return { role: "Content Planner", fallbacks: ["Media Planner"] };
  if (t.includes("carousel") || t.includes("instagram")) return { role: "Copywriter", fallbacks: ["Creative Director"] };
  if (t.includes("reel")) return { role: "Creative Director", fallbacks: ["Copywriter"] };
  if (t.includes("facebook") || t.includes("google ads")) return { role: "Media Planner", fallbacks: ["Copywriter"] };
  if (t.includes("email")) return { role: "Copywriter", fallbacks: ["Content Planner"] };
  if (t.includes("landing")) return { role: "Copywriter", fallbacks: ["SEO Specialist"] };
  if (t.includes("seo")) return { role: "SEO Specialist", fallbacks: ["Copywriter"] };
  if (t.includes("kpi") || t.includes("performance")) return { role: "Performance Analyst", fallbacks: ["Data Analyst"] };
  if (t.includes("competitor")) return { role: "Competitive Intelligence", fallbacks: ["Market Research Analyst"] };
  return { role: "Copywriter", fallbacks: ["Content Planner"] };
}
