import {
  KnowledgeRequestBuilder,
  knowledgeIdentityFromIds,
} from "../builders/knowledge-builders";
import type { KnowledgeRequest } from "../contracts/knowledge-models";

export function sampleKnowledgeRequest(
  overrides?: Partial<{ query: string; permission: string }>
): KnowledgeRequest {
  const identity = knowledgeIdentityFromIds({
    organizationId: "org_1",
    workspaceId: "ws_1",
    userId: "user_1",
    capabilityId: "echo",
  });

  return KnowledgeRequestBuilder.create()
    .withIdentity(identity)
    .withPermission({
      organizationId: identity.organizationId,
      workspaceId: identity.workspaceId,
      roles: ["member"],
      permissions: [overrides?.permission ?? "intelligence.invoke"],
      capabilityId: identity.capabilityId,
      classification: "internal",
    })
    .withQuery(overrides?.query ?? "brand")
    .withFilter({
      excludeDeprecated: true,
      excludeExpired: true,
      maxDocuments: 5,
    })
    .withRanking({ strategy: "hybrid" })
    .build();
}
