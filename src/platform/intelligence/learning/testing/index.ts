import { createArtifactEngine } from "../../artifacts/factories/create-artifact-engine";
import { ArtifactInputBuilder } from "../../artifacts/builders/artifact-input-builder";
import {
  LearningRequestBuilder,
  learningIdentityFromIds,
} from "../builders/learning-builders";
import type { ArtifactSnapshot } from "../../artifacts/contracts/artifact-models";
import type { LearningRequest } from "../contracts/learning-models";

async function createExecutionSnapshot(
  overrides: { success?: boolean; score?: number } = {}
): Promise<ArtifactSnapshot> {
  const engine = createArtifactEngine();
  const result = await engine.create(
    ArtifactInputBuilder.create()
      .withType("execution")
      .withScope({
        organizationId: "org_1",
        workspaceId: "ws_1",
        executionId: "exec_1",
        capabilityId: "echo",
      })
      .withPayload({
        execution: {
          sessionId: "session_1",
          state: overrides.success === false ? "failed" : "completed",
          success: overrides.success ?? true,
          output: { message: "sample" },
          completedAt: "2026-07-03T12:00:00.000Z",
        },
      })
      .withSourceModule("execution-runtime")
      .build()
  );
  if (!result.ok) throw new Error("Failed to create execution snapshot");
  return result.value.snapshot;
}

async function createEvaluationSnapshot(score = 0.35): Promise<ArtifactSnapshot> {
  const engine = createArtifactEngine();
  const result = await engine.create(
    ArtifactInputBuilder.create()
      .withType("evaluation")
      .withScope({
        organizationId: "org_1",
        workspaceId: "ws_1",
        executionId: "exec_1",
      })
      .withPayload({
        evaluation: {
          reportId: "ereport_1",
          requestId: "ereq_1",
          identity: {
            organizationId: "org_1",
            workspaceId: "ws_1",
            executionId: "exec_1",
          },
          rubric: { id: "r1", name: "default", version: "1", criteria: [], passingScore: 0.7 },
          judgeResults: [],
          summary: {
            overallScore: score,
            passingScore: 0.7,
            passed: score >= 0.7,
            judgeCount: 1,
            passedJudgeCount: score >= 0.7 ? 1 : 0,
            failedCriteria: score < 0.7 ? ["crit_1"] : [],
            highlights: [],
          },
          generatedAt: "2026-07-03T12:00:00.000Z",
        },
      })
      .withSourceModule("evaluation")
      .build()
  );
  if (!result.ok) throw new Error("Failed to create evaluation snapshot");
  return result.value.snapshot;
}

export async function sampleArtifactSnapshots(): Promise<ArtifactSnapshot[]> {
  return [
    await createExecutionSnapshot(),
    await createExecutionSnapshot({ success: false }),
    await createEvaluationSnapshot(0.3),
    await createEvaluationSnapshot(0.25),
  ];
}

export async function sampleLearningRequest(): Promise<LearningRequest> {
  const artifacts = await sampleArtifactSnapshots();
  return LearningRequestBuilder.create()
    .withIdentity(
      learningIdentityFromIds({
        organizationId: "org_1",
        workspaceId: "ws_1",
        capabilityId: "echo",
        executionId: "exec_1",
      })
    )
    .withScope({ kind: "workspace", scopeId: "ws_1" })
    .withArtifacts(artifacts)
    .build();
}
