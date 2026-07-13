import {
  MemoryRequestBuilder,
  memoryIdentityFromIds,
} from "../builders/memory-builders";
import type { MemoryIngestInput, MemoryRequest } from "../contracts/memory-models";

export function sampleMemoryIdentity() {
  return memoryIdentityFromIds({
    organizationId: "org_1",
    workspaceId: "ws_1",
    userId: "user_1",
    capabilityId: "echo",
    sessionId: "session_1",
  });
}

export function sampleMemoryRequest(): MemoryRequest {
  const identity = sampleMemoryIdentity();
  return MemoryRequestBuilder.create()
    .withIdentity(identity)
    .withScope({
      kind: "session",
      scopeId: "session_1",
      parentScopeId: "ws_1",
    })
    .withLimit(20)
    .build();
}

export function sampleMemoryIngestInput(): MemoryIngestInput {
  const identity = sampleMemoryIdentity();
  return {
    identity,
    scope: {
      kind: "session",
      scopeId: "session_1",
      parentScopeId: "ws_1",
    },
    artifacts: [
      {
        classification: "prompt",
        content: { text: "system prompt" },
        sourceModule: "prompt-compiler",
        tags: ["prompt"],
      },
      {
        classification: "response",
        content: { message: "Hello" },
        sourceModule: "gateway",
        tags: ["response"],
      },
      {
        classification: "execution",
        content: { sessionId: "session_1", state: "completed" },
        sourceModule: "execution-runtime",
        tags: ["execution"],
      },
    ],
  };
}
