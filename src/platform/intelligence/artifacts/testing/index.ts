import { ArtifactInputBuilder, artifactReference } from "../builders/artifact-input-builder";
import type { ArtifactInput } from "../contracts/artifact-models";
import type { ExecutionArtifactPayload } from "../contracts/typed-artifacts";

export function sampleExecutionPayload(): ExecutionArtifactPayload {
  return {
    execution: {
      sessionId: "session_1",
      state: "completed",
      success: true,
      message: "done",
      output: { message: "Hello artifact world" },
      completedAt: "2026-07-03T12:00:00.000Z",
    },
  };
}

export function sampleExecutionArtifactInput(): ArtifactInput<ExecutionArtifactPayload> {
  return ArtifactInputBuilder.create<ExecutionArtifactPayload>()
    .withType("execution")
    .withScope({
      organizationId: "org_1",
      workspaceId: "ws_1",
      executionId: "exec_1",
      sessionId: "session_1",
      capabilityId: "echo",
    })
    .withPayload(sampleExecutionPayload())
    .withSourceModule("execution-runtime")
    .withTitle("Sample execution artifact")
    .withTags(["execution", "sample"])
    .build();
}

export function sampleParentReference() {
  return artifactReference("art_parent_1", "context", "parent", "1.0.0+0");
}
