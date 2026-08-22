/**
 * Console observability for Intelligence OS layers.
 * Logs compact, secret-free summaries after each stage.
 */

import type { IntegrationStageKind } from "../contracts/enums";
import type { IntegrationArtifactBag } from "../contracts/artifacts";

const PREFIX = "🧠 [AI OS]";

function trunc(value: unknown, max = 180): string {
  if (value == null) return "n/a";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "n/a";
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function ids(list: readonly unknown[] | undefined, pick: (item: unknown) => string | undefined): string {
  if (!list?.length) return "none";
  return list
    .map(pick)
    .filter((s): s is string => Boolean(s))
    .slice(0, 8)
    .join(", ");
}

export function logAiOsLine(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function logAiOsWarn(message: string): void {
  console.warn(`${PREFIX} ${message}`);
}

export function summarizeLayer(
  stage: IntegrationStageKind,
  bag: IntegrationArtifactBag
): string {
  switch (stage) {
    case "task_intelligence": {
      const t = bag.task;
      return [
        `intent=${trunc(t?.intentProfile?.primaryIntent ?? t?.businessObjective?.title, 80)}`,
        `department=${String(t?.departmentClassification?.primary ?? "n/a")}`,
        `capability=${String(t?.capabilityMap?.primary ?? "n/a")}`,
        `nodes=${t?.statistics?.taskNodes ?? 0}`,
      ].join(" | ");
    }
    case "capability_intelligence": {
      const c = bag.capability;
      return [
        `shape=${String(c?.executionPlan?.shape ?? "n/a")}`,
        `capabilities=${ids(c?.executionPlan?.capabilityIds, (x) => String(x))}`,
        `steps=${c?.executionPlan?.steps?.length ?? 0}`,
      ].join(" | ");
    }
    case "agent_planning": {
      const a = bag.agentPlanning;
      return [
        `agents=${a?.statistics?.agentsRequired ?? 0}`,
        `assignments=${a?.statistics?.assignments ?? 0}`,
        `reviewLevels=${a?.statistics?.reviewLevels ?? 0}`,
      ].join(" | ");
    }
    case "workflow_intelligence": {
      const w = bag.workflow;
      return [
        `stages=${w?.statistics?.stages ?? w?.stages?.length ?? 0}`,
        `nodes=${w?.statistics?.nodes ?? 0}`,
        `approvals=${w?.statistics?.approvalGates ?? 0}`,
      ].join(" | ");
    }
    case "execution_governance": {
      const g = bag.governance;
      return [
        `approvals=${g?.explanation?.requiredApprovals?.length ?? 0}`,
        `risks=${g?.explanation?.riskFindings?.length ?? 0}`,
        `rationale=${trunc(g?.explanation?.approvalRationale, 80)}`,
      ].join(" | ");
    }
    case "experience_injection": {
      const e = bag.experienceInjection;
      return `retrieved=${e?.statistics?.candidatesRetrieved ?? 0} | injected=${e?.statistics?.afterCompression ?? 0}`;
    }
    case "execution_intelligence": {
      const x = bag.executionIntelligence;
      return [
        `strategy=${String(x?.strategy?.kind ?? "n/a")}`,
        `mode=${String(x?.mode?.kind ?? "n/a")}`,
        `risks=${x?.risks?.length ?? 0}`,
      ].join(" | ");
    }
    case "model_intelligence": {
      const m = bag.modelIntelligence;
      const rec = m?.recommendation?.primary;
      const ranked = m?.candidates?.candidates ?? [];
      return [
        `recommend=${String(rec?.providerId ?? "n/a")}/${String(rec?.modelId ?? "n/a")}`,
        `candidates=${ranked.length ? ranked.slice(0, 5).map((c) => `${c.providerId}/${c.modelId}`).join(", ") : "n/a"}`,
      ].join(" | ");
    }
    case "negotiation": {
      const n = bag.negotiation;
      return `decision=${String(n?.decision ?? "n/a")} | provider=${String(n?.negotiated?.selectedProviderId ?? bag.routing?.plan?.primary?.providerId ?? "n/a")}`;
    }
    case "routing": {
      const p = bag.routing?.plan?.primary;
      const fallbacks = bag.routing?.plan?.fallbacks ?? [];
      return [
        `provider=${String(p?.providerId ?? "unresolved")}`,
        `model=${String(p?.modelId ?? "unresolved")}`,
        `fallbacks=${fallbacks.length ? fallbacks.map((f) => String(f.providerId)).join(", ") : "none"}`,
        `warnings=${bag.routing?.warnings?.length ?? 0}`,
      ].join(" | ");
    }
    case "provider_runtime": {
      const r = bag.runtime;
      const content = r?.response?.output?.content;
      return [
        `success=${String(r?.success ?? false)}`,
        `provider=${String(r?.finalProviderId ?? r?.response?.providerId ?? "n/a")}`,
        `model=${String(r?.finalModelId ?? "n/a")}`,
        `output=${trunc(typeof content === "string" ? content : r?.error?.message, 120)}`,
      ].join(" | ");
    }
    case "consensus": {
      const c = bag.consensus?.consensus;
      return `winner=${String(c?.winningProviderId ?? "n/a")} | score=${c?.consensusScore?.overall ?? "n/a"}`;
    }
    case "evaluation": {
      const score =
        bag.evaluation?.report?.summary?.overallScore ?? bag.evaluation?.integrity?.qualityScore;
      return [
        `score=${typeof score === "number" ? score.toFixed(3) : "n/a"}`,
        `feedbackEligible=${String(bag.evaluation?.integrity?.feedbackEligible ?? "n/a")}`,
      ].join(" | ");
    }
    case "evaluation_intelligence": {
      const e = bag.evaluationIntelligence;
      return `readyForLearning=${String(e?.readyForLearning ?? false)} | ${trunc(e?.notes, 80)}`;
    }
    case "learning": {
      const l = bag.learning;
      return `insights=${l?.insights?.length ?? 0} | signals=${l?.signals?.length ?? 0}`;
    }
    case "execution_optimization": {
      const o = bag.optimization;
      return `recommendations=${o?.recommendations?.length ?? 0} | experiments=${o?.experiments?.length ?? 0}`;
    }
    case "experience_intelligence": {
      const e = bag.experienceIntelligence;
      return `extracted=${e?.experiences?.length ?? 0} | rootCauses=${e?.rootCauses?.length ?? 0}`;
    }
    case "repository_updates": {
      const r = bag.repositoryUpdates;
      return `saved=${r?.experiencesSaved ?? 0} | repositoryCount=${r?.repositoryCount ?? 0}`;
    }
    default:
      return "completed";
  }
}

export function logAiOsLayer(input: {
  readonly stage: IntegrationStageKind;
  readonly status: "succeeded" | "failed";
  readonly durationMs: number;
  readonly bag: IntegrationArtifactBag;
  readonly error?: string;
}): void {
  const label = input.stage.replace(/_/g, " ");
  if (input.status === "failed") {
    logAiOsWarn(
      `layer FAILED · ${label} · ${input.durationMs}ms · ${trunc(input.error, 240)}`
    );
    return;
  }
  logAiOsLine(
    `layer OK · ${label} · ${input.durationMs}ms · ${summarizeLayer(input.stage, input.bag)}`
  );
}

export function logBrandKnowledgeLayer(input: {
  readonly brandId?: string;
  readonly styleInstructions: string;
  readonly guidelineKeys: readonly string[];
  readonly knowledgeSnippets: number;
  readonly brandAssets: number;
  readonly negativeInstructions: number;
}): void {
  logAiOsLine(
    [
      "layer OK · brand intelligence",
      `brandId=${input.brandId ?? "n/a"}`,
      `guidelines=${input.guidelineKeys.length ? input.guidelineKeys.join(", ") : "none"}`,
      `style=${trunc(input.styleInstructions, 100)}`,
    ].join(" | ")
  );
  logAiOsLine(
    [
      "layer OK · knowledge intelligence",
      `snippets=${input.knowledgeSnippets}`,
      `assets=${input.brandAssets}`,
      `avoid=${input.negativeInstructions}`,
    ].join(" | ")
  );
}
