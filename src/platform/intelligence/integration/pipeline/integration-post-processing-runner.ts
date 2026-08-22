/**
 * Stages 12–18 — consensus through repository updates.
 * Shared by full pipeline and deferred completion paths (async media, streaming).
 */

import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import type { BridgeObservabilityRecord, StageTraceRecord } from "../contracts/trace";
import type { IntegrationStageKind } from "../contracts/enums";
import type { IntegrationBridgeSet } from "../interfaces/integration";
import type { BridgeContext } from "../interfaces/integration";
import { logAiOsLayer, logAiOsLine } from "../observability/ai-os-layer-log";

export type PostProcessingPush = (
  stage: IntegrationStageKind,
  status: StageTraceRecord["status"],
  message: string,
  durationMs: number,
  artifactRefs?: readonly string[]
) => void;

export async function runIntegrationPostProcessingStages(input: {
  readonly bridges: IntegrationBridgeSet;
  readonly ctx: BridgeContext;
  readonly bag: IntegrationArtifactBag;
  readonly stages: StageTraceRecord[];
  readonly bridgesObs: BridgeObservabilityRecord[];
  readonly completed: IntegrationStageKind[];
  readonly push: PostProcessingPush;
}): Promise<IntegrationStageKind | undefined> {
  const { bridges, ctx, bag, stages, bridgesObs, push } = input;
  const completed = input.completed;

  try {
    {
      const r = await bridges.runtimeConsensus.transfer(ctx, bag);
      if (!r.ok) {
        push("consensus", "failed", String(r.error.message), 0);
        return "consensus";
      }
      bridgesObs.push(r.value.observability);
      bag.consensus = r.value.value;
      push("consensus", "succeeded", "Consensus produced", r.value.observability.durationMs);
      logAiOsLayer({ stage: "consensus", status: "succeeded", durationMs: r.value.observability.durationMs, bag });
    }

    {
      const r = await bridges.consensusEvaluation.transfer(ctx, bag);
      if (!r.ok) {
        push("evaluation", "failed", String(r.error.message), 0);
        return "evaluation";
      }
      bridgesObs.push(r.value.observability);
      bag.evaluation = r.value.value;
      push("evaluation", "succeeded", "Evaluation completed", r.value.observability.durationMs);
      logAiOsLayer({ stage: "evaluation", status: "succeeded", durationMs: r.value.observability.durationMs, bag });
    }

    {
      const r = await bridges.evaluationIntelligence.transfer(ctx, bag.evaluation!);
      if (!r.ok) {
        push("evaluation_intelligence", "failed", String(r.error.message), 0);
        return "evaluation_intelligence";
      }
      bridgesObs.push(r.value.observability);
      bag.evaluationIntelligence = r.value.value;
      push(
        "evaluation_intelligence",
        "succeeded",
        "Evaluation intelligence packaged",
        r.value.observability.durationMs
      );
      logAiOsLayer({
        stage: "evaluation_intelligence",
        status: "succeeded",
        durationMs: r.value.observability.durationMs,
        bag,
      });
    }

    {
      const r = await bridges.evaluationLearning.transfer(ctx, bag);
      if (!r.ok) {
        push("learning", "failed", String(r.error.message), 0);
        return "learning";
      }
      bridgesObs.push(r.value.observability);
      bag.learning = r.value.value;
      push("learning", "succeeded", "Learning completed", r.value.observability.durationMs);
      logAiOsLayer({ stage: "learning", status: "succeeded", durationMs: r.value.observability.durationMs, bag });
    }

    {
      const r = await bridges.learningOptimization.transfer(ctx, bag);
      if (!r.ok) {
        push("execution_optimization", "failed", String(r.error.message), 0);
        return "execution_optimization";
      }
      bridgesObs.push(r.value.observability);
      bag.optimization = r.value.value;
      push(
        "execution_optimization",
        "succeeded",
        "Optimization completed",
        r.value.observability.durationMs
      );
      logAiOsLayer({
        stage: "execution_optimization",
        status: "succeeded",
        durationMs: r.value.observability.durationMs,
        bag,
      });
    }

    {
      const r = await bridges.optimizationExperience.transfer(ctx, bag);
      if (!r.ok) {
        push("experience_intelligence", "failed", String(r.error.message), 0);
        return "experience_intelligence";
      }
      bridgesObs.push(r.value.observability);
      bag.experienceIntelligence = r.value.value;
      push(
        "experience_intelligence",
        "succeeded",
        "Experiences extracted",
        r.value.observability.durationMs
      );
      logAiOsLayer({
        stage: "experience_intelligence",
        status: "succeeded",
        durationMs: r.value.observability.durationMs,
        bag,
      });
    }

    {
      const r = await bridges.experienceRepository.transfer(ctx, bag);
      if (!r.ok) {
        push("repository_updates", "failed", String(r.error.message), 0);
        return "repository_updates";
      }
      bridgesObs.push(r.value.observability);
      bag.repositoryUpdates = r.value.value;
      push("repository_updates", "succeeded", "Repository updated", r.value.observability.durationMs);
      logAiOsLayer({
        stage: "repository_updates",
        status: "succeeded",
        durationMs: r.value.observability.durationMs,
        bag,
      });
    }

    return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logAiOsLine(`post-processing error · ${message} · requestId=${ctx.requestId}`);
    const failed = [...stages].reverse().find((s) => s.status === "failed");
    if (failed) {
      return failed.stage;
    }
    push("repository_updates", "failed", message, 0);
    return "repository_updates";
  }
}

export function createPostProcessingPush(
  stages: StageTraceRecord[],
  completed: IntegrationStageKind[],
  nowIso: () => string
): PostProcessingPush {
  return (stage, status, message, durationMs, artifactRefs = []) => {
    const completedAt = nowIso();
    stages.push({
      stage,
      status,
      startedAt: completedAt,
      completedAt,
      durationMs,
      message,
      artifactRefs,
    });
    if (status === "succeeded") completed.push(stage);
  };
}

export function bridgeContextFromRequest(
  request: IntelligenceOsIntegrationRequest
): BridgeContext {
  const correlationId = request.correlationId ?? request.requestId;
  return { correlationId, requestId: request.requestId, request };
}
