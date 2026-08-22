/**
 * Deterministic Brief → task decomposition (no LLM, no vendor SDK).
 */

import type { StructuredBrief } from "../../brief/contracts/structured-brief";
import type { BrandContext } from "../../brand/contracts/brand-context";
import type { KnowledgeContext } from "../../knowledge/contracts/knowledge-context";
import type {
  ExecutionContextRequirements,
  ExecutionPlanAssumption,
  ExecutionPlanDependencyEdge,
  ExecutionPlanType,
  ExecutionRiskCategory,
  ExecutionTaskDefinition,
  ExecutionTaskType,
  ExecutionUnresolvedRequirement,
} from "../contracts/execution-plan";

/** Runtime capability IDs known to production negotiation registry. */
export const PLANNER_RUNTIME_CAPABILITIES = Object.freeze([
  "text.generate",
  "image.generate",
  "video.generate",
  "audio.transcribe",
  "audio.speech",
  "embedding.generate",
  "reasoning.analyze",
  "research.search",
] as const);

export type PlannerRuntimeCapability =
  (typeof PLANNER_RUNTIME_CAPABILITIES)[number];

function stableTaskId(
  executionId: string,
  planVersion: number,
  taskKey: string
): string {
  return `${executionId}:p${planVersion}:${taskKey}`;
}

function mapCapability(
  preferred: string,
  available: ReadonlySet<string>
): PlannerRuntimeCapability {
  if (available.has(preferred)) {
    return preferred as PlannerRuntimeCapability;
  }
  // Safe fallbacks within production registry
  if (preferred === "audio.synthesize" && available.has("audio.speech")) {
    return "audio.speech";
  }
  if (preferred === "text.chat" && available.has("text.generate")) {
    return "text.generate";
  }
  if (preferred === "vision.analyze" && available.has("reasoning.analyze")) {
    return "reasoning.analyze";
  }
  if (available.has("text.generate")) return "text.generate";
  return "text.generate";
}

function deliverableToTaskType(
  type: string
): ExecutionTaskType {
  switch (type) {
    case "campaign_strategy":
      return "strategy";
    case "instagram_content":
    case "social_post":
      return "social_content";
    case "meta_ad_copy":
    case "ad_creative":
      return "advertisement";
    case "landing_page":
      return "landing_page";
    case "website":
      return "website";
    case "caption":
    case "copy":
      return "copy";
    case "image":
      return "image";
    case "video":
      return "video";
    case "research_report":
      return "research";
    case "analysis":
      return "analysis";
    case "document":
      return "document";
    default:
      return "other";
  }
}

function outputContractFor(
  taskType: ExecutionTaskType,
  deliverableType?: string
): string {
  if (deliverableType === "caption") return "output.social_caption";
  switch (taskType) {
    case "strategy":
      return "output.campaign_strategy";
    case "messaging":
      return "output.messaging_framework";
    case "creative_direction":
      return "output.creative_direction";
    case "social_content":
      return "output.instagram_content";
    case "advertisement":
      return "output.meta_ad_copy";
    case "landing_page":
      return "output.landing_page";
    case "website":
      return "output.website";
    case "copy":
      return "output.copy";
    case "image":
      return "output.image";
    case "video":
      return "output.video";
    case "research":
      return "output.research_report";
    case "analysis":
      return "output.analysis";
    default:
      return "output.copy";
  }
}

function capabilityForTaskType(
  taskType: ExecutionTaskType,
  available: ReadonlySet<string>
): PlannerRuntimeCapability {
  switch (taskType) {
    case "image":
      return mapCapability("image.generate", available);
    case "video":
      return mapCapability("video.generate", available);
    case "research":
      return mapCapability("research.search", available);
    case "analysis":
    case "strategy":
    case "messaging":
    case "creative_direction":
      return mapCapability("reasoning.analyze", available);
    default:
      return mapCapability("text.generate", available);
  }
}

function brandContextReqs(
  brand?: BrandContext
): Partial<ExecutionContextRequirements> {
  if (
    !brand ||
    brand.status === "MISSING" ||
    brand.status === "EMPTY" ||
    brand.status === "INVALID"
  ) {
    return {};
  }
  return {
    brandVoice: true,
    brandTone: true,
    brandVisualIdentity: Boolean(brand.visualIdentity?.primaryColors?.length),
    brandPositioning: Boolean(brand.positioning?.statement),
  };
}

function knowledgeContextReqs(
  knowledge?: KnowledgeContext
): Partial<ExecutionContextRequirements> {
  if (
    !knowledge ||
    knowledge.status === "EMPTY" ||
    knowledge.status === "MISSING" ||
    knowledge.status === "FAILED"
  ) {
    return { knowledgeGeneral: false };
  }
  const keys = new Set(knowledge.facts.map((f) => f.key));
  return {
    knowledgeGeneral: true,
    knowledgeProductFacts: keys.has("product_name") || knowledge.facts.length > 0,
    knowledgePricing: keys.has("price"),
  };
}

export interface DecomposePlanResult {
  readonly planType: ExecutionPlanType;
  readonly tasks: readonly ExecutionTaskDefinition[];
  readonly dependencies: readonly ExecutionPlanDependencyEdge[];
  readonly assumptions: readonly ExecutionPlanAssumption[];
  readonly unresolvedRequirements: readonly ExecutionUnresolvedRequirement[];
  readonly riskCategories: readonly ExecutionRiskCategory[];
  readonly contextRequirements: ExecutionContextRequirements;
  readonly blocked: boolean;
}

export function decomposeBriefToTasks(input: {
  readonly brief: StructuredBrief;
  readonly brandContext?: BrandContext;
  readonly knowledgeContext?: KnowledgeContext;
  readonly planVersion: number;
  readonly availableCapabilities: ReadonlySet<string>;
}): DecomposePlanResult {
  const { brief, brandContext, knowledgeContext, planVersion } = input;
  const available = input.availableCapabilities;
  const assumptions: ExecutionPlanAssumption[] = [];
  const unresolved: ExecutionUnresolvedRequirement[] = [];
  const risks: ExecutionRiskCategory[] = [];

  // Propagate brief missing required info → unresolved / blocked for fact-heavy intents
  for (const m of brief.missingInformation) {
    unresolved.push({
      key: m.key,
      reason: m.reason,
      severity: m.severity,
    });
  }

  const brandReqs = brandContextReqs(brandContext);
  const knowledgeReqs = knowledgeContextReqs(knowledgeContext);

  const needsProductKnowledge =
    brief.intent.kind === "campaign" ||
    brief.intent.kind === "landing_page" ||
    brief.deliverables.some((d) =>
      ["landing_page", "meta_ad_copy", "instagram_content", "campaign_strategy"].includes(
        d.type
      )
    );

  const knowledgeMissing =
    !knowledgeContext ||
    knowledgeContext.status === "EMPTY" ||
    knowledgeContext.status === "MISSING" ||
    (knowledgeContext.status !== "FAILED" &&
      knowledgeContext.facts.length === 0 &&
      knowledgeContext.retrievedChunks.length === 0);

  // Website with missing required pages → BLOCKED (do not invent)
  const websiteBlocked =
    (brief.intent.kind === "website" ||
      brief.deliverables.some((d) => d.type === "website")) &&
    brief.missingInformation.some((m) => m.severity === "required");

  if (websiteBlocked) {
    return {
      planType: "blocked",
      tasks: [],
      dependencies: [],
      assumptions,
      unresolvedRequirements: unresolved.length
        ? unresolved
        : [
            {
              key: "website_purpose",
              reason: "Website plan requires purpose/pages before task decomposition",
              severity: "required",
            },
          ],
      riskCategories: ["missing_context"],
      contextRequirements: {
        brief: true,
        ...brandReqs,
        ...knowledgeReqs,
      },
      blocked: true,
    };
  }

  const tasks: ExecutionTaskDefinition[] = [];
  const edges: ExecutionPlanDependencyEdge[] = [];

  const makeTask = (opts: {
    taskKey: string;
    name: string;
    type: ExecutionTaskType;
    objective: string;
    deps: readonly string[];
    deliverableType?: string;
    quantity?: number;
    channels?: readonly string[];
    sections?: readonly string[];
    priority?: "low" | "normal" | "high";
  }): ExecutionTaskDefinition => {
    const taskId = stableTaskId(brief.executionId, planVersion, opts.taskKey);
    const cap = capabilityForTaskType(opts.type, available);
    const contractId = outputContractFor(opts.type, opts.deliverableType);
    return {
      taskId,
      taskKey: opts.taskKey,
      name: opts.name,
      type: opts.type,
      objective: opts.objective,
      inputRequirements: ["brief", ...(opts.deps.length ? ["upstream_task_outputs"] : [])],
      outputRequirements: {
        type: opts.deliverableType ?? opts.type,
        quantity: opts.quantity,
        channels: opts.channels,
        requiredSections: opts.sections,
        outputContractId: contractId,
      },
      requiredCapabilities: [cap],
      contextRequirements: {
        brief: true,
        brandVoice: brandReqs.brandVoice,
        brandTone: brandReqs.brandTone,
        brandVisualIdentity:
          opts.type === "landing_page" ||
          opts.type === "social_content" ||
          opts.type === "creative_direction" ||
          opts.type === "image"
            ? brandReqs.brandVisualIdentity ?? true
            : brandReqs.brandVisualIdentity,
        brandPositioning:
          opts.type === "strategy" ||
          opts.type === "messaging" ||
          opts.type === "landing_page"
            ? true
            : brandReqs.brandPositioning,
        knowledgeProductFacts: knowledgeReqs.knowledgeProductFacts,
        knowledgePricing:
          opts.type === "landing_page" || opts.type === "advertisement"
            ? knowledgeReqs.knowledgePricing
            : undefined,
        knowledgeGeneral: knowledgeReqs.knowledgeGeneral,
      },
      dependencies: opts.deps,
      constraints: [],
      priority: opts.priority ?? brief.priority,
      executionMode:
        opts.type === "video" || opts.type === "image" ? "either" : "sync",
      retryPolicyReference: "default",
      risk:
        opts.type === "advertisement" || opts.type === "landing_page"
          ? "external_publishing"
          : "none",
      provenance: [
        {
          field: "taskKey",
          value: opts.taskKey,
          source: "BRIEF",
        },
        {
          field: "capability",
          value: cap,
          source: "CAPABILITY_REGISTRY",
        },
        {
          field: "outputContract",
          value: contractId,
          source: "OUTPUT_CONTRACT",
        },
      ],
    };
  };

  // Optional research when product knowledge missing for launch-like work
  let researchTaskId: string | undefined;
  if (needsProductKnowledge && knowledgeMissing) {
    const research = makeTask({
      taskKey: "research_product_information",
      name: "Research product information",
      type: "research",
      objective:
        "Gather product/business facts required for accurate launch deliverables",
      deps: [],
    });
    tasks.push(research);
    researchTaskId = research.taskId;
    unresolved.push({
      key: "product_facts",
      reason:
        "KnowledgeContext empty/missing — research task planned; do not invent facts",
      severity: "recommended",
    });
    risks.push("missing_context");
    assumptions.push({
      statement:
        "Product facts will be supplied by research or user before final publish",
      source: "SYSTEM_RULE",
      confidence: 0.7,
    });
  }

  const deliverables = brief.deliverables.filter((d) => d.required !== false);
  const isCampaignLike =
    brief.intent.kind === "campaign" ||
    deliverables.filter((d) =>
      [
        "campaign_strategy",
        "instagram_content",
        "social_post",
        "meta_ad_copy",
        "ad_creative",
        "landing_page",
      ].includes(d.type)
    ).length >= 2;

  if (isCampaignLike || deliverables.length >= 3) {
    // Campaign spine: strategy → messaging → creative → parallel leaves
    const strategy = makeTask({
      taskKey: "campaign_strategy",
      name: "Campaign strategy",
      type: "strategy",
      objective: "Define campaign strategy aligned to brief objective",
      deps: researchTaskId ? [researchTaskId] : [],
      deliverableType: "campaign_strategy",
      priority: "high",
    });
    tasks.push(strategy);

    const messaging = makeTask({
      taskKey: "messaging_framework",
      name: "Messaging framework",
      type: "messaging",
      objective: "Define core messages and claims from strategy",
      deps: [strategy.taskId],
    });
    tasks.push(messaging);
    edges.push({
      fromTaskId: strategy.taskId,
      toTaskId: messaging.taskId,
      kind: "hard",
    });

    const creative = makeTask({
      taskKey: "creative_direction",
      name: "Creative direction",
      type: "creative_direction",
      objective: "Define creative direction for campaign assets",
      deps: [messaging.taskId],
    });
    tasks.push(creative);
    edges.push({
      fromTaskId: messaging.taskId,
      toTaskId: creative.taskId,
      kind: "hard",
    });

    if (researchTaskId) {
      edges.push({
        fromTaskId: researchTaskId,
        toTaskId: strategy.taskId,
        kind: "hard",
      });
    }

    const leafTypes = new Set(
      deliverables.map((d) => d.type).filter((t) => t !== "campaign_strategy")
    );

    const addLeaf = (
      key: string,
      name: string,
      type: ExecutionTaskType,
      deliverableType: string,
      channels?: readonly string[],
      quantity?: number,
      sections?: readonly string[]
    ) => {
      const leaf = makeTask({
        taskKey: key,
        name,
        type,
        objective: name,
        deps: [creative.taskId],
        deliverableType,
        channels,
        quantity,
        sections,
      });
      tasks.push(leaf);
      edges.push({
        fromTaskId: creative.taskId,
        toTaskId: leaf.taskId,
        kind: "hard",
      });
    };

    if (
      leafTypes.has("instagram_content") ||
      leafTypes.has("social_post") ||
      brief.channels.some((c) => /instagram|social/i.test(c))
    ) {
      addLeaf(
        "instagram_content",
        "Instagram content",
        "social_content",
        "instagram_content",
        ["instagram"],
        5
      );
    }
    if (leafTypes.has("meta_ad_copy") || leafTypes.has("ad_creative")) {
      addLeaf(
        "meta_ad_variants",
        "Meta ad variants",
        "advertisement",
        "meta_ad_copy",
        ["meta"],
        3
      );
    }
    if (leafTypes.has("landing_page")) {
      addLeaf(
        "landing_page",
        "Landing page",
        "landing_page",
        "landing_page",
        undefined,
        1,
        ["hero", "benefits", "proof", "CTA"]
      );
    }
    // Catch other deliverables not covered
    for (const d of deliverables) {
      if (
        d.type === "campaign_strategy" ||
        d.type === "instagram_content" ||
        d.type === "social_post" ||
        d.type === "meta_ad_copy" ||
        d.type === "ad_creative" ||
        d.type === "landing_page"
      ) {
        continue;
      }
      if (tasks.some((t) => t.taskKey === d.type || t.taskKey === d.id)) continue;
      const tType = deliverableToTaskType(d.type);
      addLeaf(
        d.id || d.type,
        d.description || d.type,
        tType,
        d.type,
        d.channel ? [d.channel] : undefined,
        d.quantity
      );
    }

    risks.push("multi_step");
    if (
      leafTypes.has("meta_ad_copy") ||
      leafTypes.has("landing_page") ||
      leafTypes.has("instagram_content")
    ) {
      risks.push("external_publishing");
    }
    assumptions.push({
      statement:
        "Parallel leaf deliverables share creative direction and may execute independently after it",
      source: "SYSTEM_RULE",
      confidence: 0.9,
    });

    return {
      planType: "campaign",
      tasks,
      dependencies: edges,
      assumptions,
      unresolvedRequirements: unresolved,
      riskCategories: [...new Set(risks)],
      contextRequirements: {
        brief: true,
        ...brandReqs,
        ...knowledgeReqs,
      },
      blocked: false,
    };
  }

  // Simple / few-deliverable path
  if (deliverables.length === 0) {
    const primaryCap =
      brief.requiredCapabilities.find((c) => c.role === "primary")
        ?.capabilityId ?? "text.generate";
    const mapped = mapCapability(primaryCap, available);
    const type: ExecutionTaskType =
      mapped.startsWith("image")
        ? "image"
        : mapped.startsWith("video")
          ? "video"
          : brief.intent.kind === "research"
            ? "research"
            : "copy";
    const task = makeTask({
      taskKey: "primary_deliverable",
      name: brief.objective.slice(0, 80) || "Primary deliverable",
      type,
      objective: brief.objective,
      deps: researchTaskId ? [researchTaskId] : [],
      deliverableType:
        brief.intent.kind === "copy" || brief.intent.kind === "social_content"
          ? "caption"
          : undefined,
      channels: brief.channels.length ? brief.channels : undefined,
    });
    // Override capability to mapped primary when simple
    const fixed: ExecutionTaskDefinition = {
      ...task,
      requiredCapabilities: [mapped],
    };
    tasks.push(fixed);
    if (researchTaskId) {
      edges.push({
        fromTaskId: researchTaskId,
        toTaskId: fixed.taskId,
        kind: "hard",
      });
    }
  } else if (deliverables.length === 1) {
    const d = deliverables[0]!;
    const tType = deliverableToTaskType(d.type);
    const task = makeTask({
      taskKey: d.id || d.type || "primary_deliverable",
      name: d.description || d.type,
      type: tType,
      objective: d.description || brief.objective,
      deps: researchTaskId ? [researchTaskId] : [],
      deliverableType: d.type === "caption" ? "caption" : d.type,
      quantity: d.quantity,
      channels: d.channel ? [d.channel] : brief.channels,
    });
    tasks.push(task);
    if (researchTaskId) {
      edges.push({
        fromTaskId: researchTaskId,
        toTaskId: task.taskId,
        kind: "hard",
      });
    }
  } else {
    // Sequential chain by brief order — still explicit edges (not array-order-as-deps)
    let prevId = researchTaskId;
    for (const d of deliverables) {
      const tType = deliverableToTaskType(d.type);
      const task = makeTask({
        taskKey: d.id || d.type,
        name: d.description || d.type,
        type: tType,
        objective: d.description || brief.objective,
        deps: prevId ? [prevId] : [],
        deliverableType: d.type,
        quantity: d.quantity,
        channels: d.channel ? [d.channel] : undefined,
      });
      tasks.push(task);
      if (prevId) {
        edges.push({
          fromTaskId: prevId,
          toTaskId: task.taskId,
          kind: "hard",
        });
      }
      prevId = task.taskId;
    }
  }

  assumptions.push({
    statement: "Single-path plan derived deterministically from StructuredBrief deliverables",
    source: "SYSTEM_RULE",
    confidence: 0.92,
  });

  if (brandContext && brandContext.status !== "MISSING") {
    assumptions.push({
      statement: "Tasks requiring brand voice/tone will consume BrandContext references",
      source: "BRAND",
      confidence: 0.85,
    });
  }

  return {
    planType: tasks.length <= 1 ? "single_task" : "multi_deliverable",
    tasks,
    dependencies: edges,
    assumptions,
    unresolvedRequirements: unresolved,
    riskCategories: [...new Set(risks.length ? risks : (["none"] as const))],
    contextRequirements: {
      brief: true,
      ...brandReqs,
      ...knowledgeReqs,
    },
    blocked: false,
  };
}

export function estimateComplexity(
  taskCount: number,
  dependencyCount: number,
  modalities: number
): "LOW" | "MEDIUM" | "HIGH" {
  if (taskCount <= 1 && dependencyCount === 0) return "LOW";
  if (taskCount <= 3 && modalities <= 1) return "MEDIUM";
  if (taskCount >= 5 || dependencyCount >= 4 || modalities >= 2) return "HIGH";
  return "MEDIUM";
}
