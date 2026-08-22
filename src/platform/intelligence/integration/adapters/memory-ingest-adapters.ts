/**
 * Memory ingest adapter — persist prompt/response/evaluation from integration bag.
 */

import { memoryIdentityFromIds } from "../../memory/builders/memory-builders";
import type { MemoryIngestInput } from "../../memory/contracts/memory-models";
import type { BridgeContext } from "../interfaces/integration";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import {
  extractIntegrationOutputText,
  resolveIntegrationTenant,
} from "./integration-tenant-scope";

export function toMemoryIngestInput(
  ctx: BridgeContext,
  bag: IntegrationArtifactBag
): MemoryIngestInput {
  const tenant = resolveIntegrationTenant({
    request: ctx.request,
    requestId: ctx.requestId,
    bag,
  });
  const prompt = bag.task?.request.rawPrompt ?? ctx.request.rawPrompt ?? "";
  const outputText = extractIntegrationOutputText(bag);
  const artifacts: MemoryIngestInput["artifacts"] = [];

  if (prompt.trim()) {
    artifacts.push({
      classification: "prompt",
      content: { text: prompt },
      sourceModule: "integration",
      tags: ["prompt", "execution"],
      importance: 0.6,
    });
  }

  if (outputText) {
    artifacts.push({
      classification: "response",
      content: {
        text: outputText,
        output: bag.runtime?.response?.output ?? bag.consensus?.consensus.canonicalResponse.output,
      },
      sourceModule: "integration-runtime",
      tags: ["response", "execution"],
      importance: 0.7,
    });
  }

  if (bag.evaluation?.report.summary) {
    artifacts.push({
      classification: "evaluation",
      content: {
        overallScore: bag.evaluation.report.summary.overallScore,
        passed: bag.evaluation.report.summary.passed,
        reportId: bag.evaluation.report.reportId,
      },
      sourceModule: "evaluation",
      tags: ["evaluation"],
      importance: 0.5,
    });
  }

  if (bag.runtime?.sessionId || bag.runtime?.success != null) {
    artifacts.push({
      classification: "execution",
      content: {
        sessionId: bag.runtime?.sessionId,
        success: bag.runtime?.success,
        executionId: tenant.executionId,
      },
      sourceModule: "integration-runtime",
      tags: ["execution"],
      importance: 0.4,
    });
  }

  return {
    identity: memoryIdentityFromIds({
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      userId: tenant.userId,
      capabilityId: tenant.capabilityId,
      executionId: tenant.executionId,
      sessionId: bag.runtime?.sessionId,
    }),
    scope: {
      kind: "workspace",
      scopeId: tenant.workspaceId,
      parentScopeId: tenant.organizationId,
    },
    artifacts,
  };
}
