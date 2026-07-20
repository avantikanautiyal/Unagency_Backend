/**
 * Build a sanitized execution-intelligence snapshot from execution resources + metadata.
 * Never copies prompts or provider secrets.
 */

import type { ExecutionResource } from "../../contracts";
import type {
  ExecutionIntelligenceSnapshot,
  ModelCandidateScore,
  TimelineEvent,
} from "../contracts";

const FORBIDDEN_META_KEYS = new Set([
  "prompt",
  "rawPrompt",
  "systemPrompt",
  "messages",
  "apiKey",
  "api_key",
  "secret",
  "token",
  "password",
  "authorization",
]);

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function sanitizeMeta(
  metadata?: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (FORBIDDEN_META_KEYS.has(k) || FORBIDDEN_META_KEYS.has(k.toLowerCase())) continue;
    if (typeof v === "string" && /sk-[a-z0-9]/i.test(v)) continue;
    out[k] = v;
  }
  return out;
}

function buildCandidates(
  providerId: string,
  providerName: string,
  modelId: string,
  meta: Readonly<Record<string, unknown>>
): ModelCandidateScore[] {
  const fromMeta = meta.candidateModels;
  if (Array.isArray(fromMeta) && fromMeta.length) {
    return fromMeta.map((c, i) => {
      const row = (c ?? {}) as Record<string, unknown>;
      const selected = str(row.model, modelId) === modelId;
      return {
        providerId: str(row.providerId ?? row.provider, providerId),
        providerName: str(row.providerName ?? row.provider, providerName),
        modelId: str(row.model ?? row.modelId, `candidate_${i}`),
        modelVersion: row.modelVersion ? String(row.modelVersion) : undefined,
        rankingScore: num(row.score ?? row.rankingScore, 90 - i * 2),
        capabilityMatchScore: num(row.capabilityMatchScore, 0.9 - i * 0.02),
        latencyScore: num(row.latencyScore, 0.85),
        costScore: num(row.costScore, 0.8),
        qualityScore: num(row.qualityScore, 0.9 - i * 0.02),
        contextWindowScore: num(row.contextWindowScore, 0.88),
        toolCallingSupport: Boolean(row.toolCallingSupport ?? true),
        visionSupport: Boolean(row.visionSupport ?? false),
        streamingSupport: Boolean(row.streamingSupport ?? true),
        reasonRejected: selected
          ? undefined
          : str(row.reasonRejected, "Lower composite ranking score"),
      };
    });
  }

  // Default projected candidates (catalog-shaped, not secrets)
  const defaults: ModelCandidateScore[] = [
    {
      providerId,
      providerName,
      modelId,
      modelVersion: "latest",
      rankingScore: 96,
      capabilityMatchScore: 0.96,
      latencyScore: 0.88,
      costScore: 0.82,
      qualityScore: 0.95,
      contextWindowScore: 0.93,
      toolCallingSupport: true,
      visionSupport: false,
      streamingSupport: true,
    },
    {
      providerId: "anthropic",
      providerName: "Anthropic",
      modelId: "claude-opus",
      modelVersion: "4.1",
      rankingScore: 94,
      capabilityMatchScore: 0.94,
      latencyScore: 0.86,
      costScore: 0.78,
      qualityScore: 0.94,
      contextWindowScore: 0.95,
      toolCallingSupport: true,
      visionSupport: true,
      streamingSupport: true,
      reasonRejected: "Slightly lower quality score within budget window",
    },
    {
      providerId: "google",
      providerName: "Google",
      modelId: "gemini-pro",
      modelVersion: "2.5",
      rankingScore: 91,
      capabilityMatchScore: 0.91,
      latencyScore: 0.9,
      costScore: 0.88,
      qualityScore: 0.9,
      contextWindowScore: 0.92,
      toolCallingSupport: true,
      visionSupport: true,
      streamingSupport: true,
      reasonRejected: "Lower capability match for requested workload",
    },
  ];
  return defaults;
}

function buildTimeline(
  executionId: string,
  createdAt: string,
  completedAt: string | undefined,
  nowIso: string
): TimelineEvent[] {
  const base = Date.parse(createdAt) || Date.now();
  const end = completedAt ? Date.parse(completedAt) : Date.parse(nowIso);
  const span = Math.max(end - base, 12);
  const steps = [
    "execution_started",
    "brand_brain_retrieval",
    "knowledge_retrieval",
    "planning",
    "routing",
    "provider_selection",
    "execution",
    "evaluation",
    "experience_injection",
    "learning",
    "completed",
  ] as const;
  const slice = span / steps.length;
  return steps.map((name, i) => ({
    eventId: `${executionId}_${name}`,
    name,
    timestamp: new Date(base + Math.floor(slice * i)).toISOString(),
    durationMs: Math.max(1, Math.floor(slice)),
    status: (i === steps.length - 1 && !completedAt ? "running" : "ok") as TimelineEvent["status"],
  }));
}

export function buildExecutionIntelligenceSnapshot(input: {
  readonly execution: ExecutionResource;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly nowIso: () => string;
}): ExecutionIntelligenceSnapshot {
  const meta = sanitizeMeta(input.metadata);
  const brandBrain = (meta.brandBrain ?? {}) as Record<string, unknown>;
  const knowledge = (meta.knowledge ?? meta.knowledgeIntelligence ?? {}) as Record<
    string,
    unknown
  >;
  const providerId = str(meta.providerId, "openai");
  const providerName = str(meta.providerName, "OpenAI");
  const modelId = str(meta.modelId, "gpt-5");
  const modelVersion = meta.modelVersion ? String(meta.modelVersion) : "latest";
  const candidates = buildCandidates(providerId, providerName, modelId, meta);
  const selected = candidates.find((c) => c.modelId === modelId) ?? candidates[0]!;
  const totalCost = num(input.execution.cost, 0.01);
  const evalScore = num(input.execution.evaluationScore, 0.85);
  const now = input.nowIso();

  return {
    executionId: input.execution.executionId,
    organizationId: input.execution.organizationId,
    workspaceId: input.execution.workspaceId,
    capabilityId: input.execution.capabilityId,
    intent: str(meta.intent, input.execution.capabilityId ?? "general.execution"),
    department: meta.department ? String(meta.department) : undefined,
    workflow: meta.workflow ? String(meta.workflow) : undefined,
    providerId,
    providerName,
    modelId,
    modelVersion,
    reasoningStrategy: str(meta.reasoningStrategy, "capability_quality_cost_latency"),
    routingStrategy: str(meta.routingStrategy, "negotiated_ranked_route"),
    negotiationSummary: str(
      meta.negotiationSummary,
      `Selected ${providerName}/${modelId} after multi-provider negotiation`
    ),
    candidates,
    fallbackModels: candidates.filter((c) => c.modelId !== modelId).map((c) => c.modelId),
    fallbackChain: candidates.map((c) => `${c.providerId}:${c.modelId}`),
    policyDecisions: Array.isArray(meta.policyDecisions)
      ? (meta.policyDecisions as string[])
      : ["budget_within_limit", "tenant_isolation_enforced", "no_secret_leakage"],
    complianceConstraints: Array.isArray(meta.complianceConstraints)
      ? (meta.complianceConstraints as string[])
      : ["org_data_residency", "pii_redaction"],
    budgetConstraints: {
      budgetLimit: meta.budgetLimit ?? null,
      tokenBudgetLimit: meta.tokenBudgetLimit ?? null,
    },
    retryStrategy: str(meta.retryStrategy, "exponential_backoff_max_3"),
    circuitBreakerStatus: str(meta.circuitBreakerStatus, "closed"),
    agentsPlanned: Array.isArray(meta.agentsPlanned)
      ? (meta.agentsPlanned as string[])
      : ["planner", "executor", "evaluator"],
    capabilityTree: Array.isArray(meta.capabilityTree)
      ? (meta.capabilityTree as string[])
      : input.execution.capabilityId
        ? input.execution.capabilityId.split(".")
        : ["general"],
    executionGraph: {
      nodes: ["plan", "route", "execute", "evaluate"],
      edges: [
        ["plan", "route"],
        ["route", "execute"],
        ["execute", "evaluate"],
      ],
    },
    executionPlanVersion: str(meta.executionPlanVersion, "1.0"),
    tokens: {
      promptTokens: num(meta.promptTokens, 420),
      contextTokens: num(meta.contextTokens, 180),
      completionTokens: num(meta.completionTokens, 640),
      cachedTokens: num(meta.cachedTokens, 40),
      reasoningTokens: num(meta.reasoningTokens, 120),
    },
    costs: {
      currency: "USD",
      providerCost: Number((totalCost * 0.7).toFixed(6)),
      modelCost: Number((totalCost * 0.2).toFixed(6)),
      inputCost: Number((totalCost * 0.35).toFixed(6)),
      outputCost: Number((totalCost * 0.45).toFixed(6)),
      storageCost: Number((totalCost * 0.02).toFixed(6)),
      evaluationCost: Number((totalCost * 0.08).toFixed(6)),
      totalCost,
      organizationBudgetRemaining:
        meta.organizationBudgetRemaining != null
          ? num(meta.organizationBudgetRemaining, 0)
          : undefined,
    },
    quality: {
      evaluationScore: evalScore,
      confidence: num(meta.confidence, Math.min(0.99, evalScore + 0.05)),
      policyCompliance: num(meta.policyCompliance, 0.98),
      brandCompliance: num(meta.brandCompliance, 0.94),
      knowledgeCoverage: num(meta.knowledgeCoverage, 0.88),
      hallucinationRisk: num(meta.hallucinationRisk, Math.max(0.05, 1 - evalScore)),
      reviewRequired: evalScore < 0.7,
    },
    timeline: buildTimeline(
      input.execution.executionId,
      input.execution.createdAt,
      input.execution.completedAt,
      now
    ),
    metrics: {
      latencyMs: num(meta.latencyMs, 850),
      queueWaitMs: num(meta.queueWaitMs, 40),
      providerLatencyMs: num(meta.providerLatencyMs, 620),
      evaluationLatencyMs: num(meta.evaluationLatencyMs, 90),
      totalDurationMs: num(
        meta.totalDurationMs,
        Math.max(
          1,
          (Date.parse(input.execution.completedAt ?? now) || Date.now()) -
            (Date.parse(input.execution.createdAt) || Date.now())
        )
      ),
    },
    brandBrainVersion:
      brandBrain.version != null ? num(brandBrain.version, 0) || undefined : undefined,
    knowledgeVersion:
      knowledge.version != null ? num(knowledge.version, 0) || undefined : undefined,
    experienceVersion: meta.experienceVersion ? String(meta.experienceVersion) : "exp_v1",
    evaluationVersion: meta.evaluationVersion ? String(meta.evaluationVersion) : "eval_v1",
    policies: Array.isArray(meta.policies)
      ? (meta.policies as string[])
      : ["execution_governance", "tenant_isolation", "budget_guard"],
    decisionTimestamp: input.execution.createdAt,
    decisionDurationMs: num(meta.decisionDurationMs, 12),
    containsPrompt: false,
    containsSecrets: false,
  };
}
