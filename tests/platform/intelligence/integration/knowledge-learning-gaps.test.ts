/**
 * Knowledge + learning gap-fill — integration adapters.
 */

import { toLearningRequest, toEvaluationRequest } from "../../../../src/platform/intelligence/integration/adapters/request-adapters";
import { resolveIntegrationTenant, extractIntegrationOutputText } from "../../../../src/platform/intelligence/integration/adapters/integration-tenant-scope";
import { buildBagArtifactSnapshots } from "../../../../src/platform/intelligence/integration/adapters/bag-artifact-snapshots";
import { toMemoryIngestInput } from "../../../../src/platform/intelligence/integration/adapters/memory-ingest-adapters";
import { createMemoryIntelligenceEngine } from "../../../../src/platform/intelligence/memory/factories/create-memory-engine";
import { InMemoryMemoryStore } from "../../../../src/platform/intelligence/memory/stores/in-memory-memory-store";
import { createKnowledgeIntelligenceEngine } from "../../../../src/platform/intelligence/knowledge/factories/create-knowledge-engine";
import { KnowledgeRequestBuilder } from "../../../../src/platform/intelligence/knowledge/builders/knowledge-builders";
import { asOrganizationId, asWorkspaceId } from "../../../../src/platform/intelligence/shared/identifiers";
import type { BridgeContext } from "../../../../src/platform/intelligence/integration/interfaces/integration";
import type { IntegrationArtifactBag } from "../../../../src/platform/intelligence/integration/contracts/artifacts";
import { chunkText, executionLearningAssetId } from "../../../../src/services/knowledge-document-index-service";

function sampleCtx(overrides: Partial<BridgeContext["request"]> = {}): BridgeContext {
  return {
    correlationId: "corr_gap_1",
    requestId: "req_gap_1",
    request: {
      requestId: "req_gap_1",
      rawPrompt: "Write a launch post for Acme X1",
      organizationId: asOrganizationId("507f1f77bcf86cd799439011"),
      workspaceId: asWorkspaceId("507f1f77bcf86cd799439012"),
      metadata: { executionId: "exec_gap_1", brandId: "507f1f77bcf86cd799439013" },
      ...overrides,
    },
  };
}

function sampleBag(): IntegrationArtifactBag {
  return {
    task: {
      resultId: "task_1",
      request: { requestId: "req_gap_1", rawPrompt: "Write a launch post for Acme X1" },
      capabilityMap: { primary: "text.generate", requirements: [] },
      businessObjective: { title: "Launch", description: "Launch post" },
      structuredTask: { title: "Launch post", description: "Write post" },
      structuredTaskPlan: { steps: [] },
      complexityProfile: { tier: "moderate", score: 0.5, factors: [] },
      departmentClassification: { primary: "marketing", confidence: 0.9 },
    } as IntegrationArtifactBag["task"],
    runtime: {
      sessionId: "sess_1",
      success: true,
      response: { output: { message: "Acme X1 launches tomorrow with 48h battery." } },
    } as IntegrationArtifactBag["runtime"],
  };
}

describe("integration tenant scope", () => {
  it("resolves org/workspace/execution from request metadata", () => {
    const tenant = resolveIntegrationTenant({
      request: sampleCtx().request,
      requestId: "req_gap_1",
      bag: sampleBag(),
    });
    expect(tenant.organizationId).toBe("507f1f77bcf86cd799439011");
    expect(tenant.workspaceId).toBe("507f1f77bcf86cd799439012");
    expect(tenant.executionId).toBe("exec_gap_1");
    expect(tenant.capabilityId).toBe("text.generate");
  });

  it("extracts runtime output text", () => {
    const text = extractIntegrationOutputText(sampleBag());
    expect(text).toContain("Acme X1");
  });
});

describe("learning adapters use pipeline artifacts", () => {
  it("builds artifact snapshots with tenant scope", async () => {
    const snapshots = await buildBagArtifactSnapshots(sampleCtx(), sampleBag());
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0]?.artifact.identity.organizationId).toBe(
      "507f1f77bcf86cd799439011"
    );
    expect(snapshots[0]?.artifact.identity.workspaceId).toBe(
      "507f1f77bcf86cd799439012"
    );
  });

  it("toLearningRequest uses real tenant not org_1/ws_1", async () => {
    const req = await toLearningRequest(sampleCtx(), sampleBag());
    expect(req.identity.organizationId).toBe("507f1f77bcf86cd799439011");
    expect(req.scope.scopeId).toBe("507f1f77bcf86cd799439012");
    expect(req.artifacts.length).toBeGreaterThan(0);
    expect(req.artifacts.some((a) => a.artifact.type === "execution")).toBe(true);
  });

  it("toEvaluationRequest uses real tenant", () => {
    const req = toEvaluationRequest(sampleCtx(), sampleBag());
    expect(req.identity.organizationId).toBe("507f1f77bcf86cd799439011");
    expect(req.identity.executionId).toBe("exec_gap_1");
  });
});

describe("memory ingest adapter", () => {
  it("builds ingest input from bag and persists via engine", async () => {
    const input = toMemoryIngestInput(sampleCtx(), sampleBag());
    expect(input.artifacts.some((a) => a.classification === "prompt")).toBe(true);
    expect(input.artifacts.some((a) => a.classification === "response")).toBe(true);

    const store = new InMemoryMemoryStore();
    const engine = createMemoryIntelligenceEngine({ store });
    const result = await engine.ingest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.storedCount).toBeGreaterThan(0);
  });
});

describe("execution knowledge indexing helpers", () => {
  it("chunks combined prompt/output text", () => {
    const chunks = chunkText("User prompt:\nHello\n\nExecution output:\nWorld");
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("uses deterministic asset id for execution learnings", () => {
    const a = executionLearningAssetId("exec_1").toString();
    const b = executionLearningAssetId("exec_1").toString();
    expect(a).toBe(b);
    expect(a).toHaveLength(24);
  });
});

describe("product chunk knowledge source", () => {
  it("returns empty documents when org id is invalid for mongo", async () => {
    const engine = createKnowledgeIntelligenceEngine({ useProductChunks: true });
    const request = KnowledgeRequestBuilder.create()
      .withIdentity({
        organizationId: asOrganizationId("not_a_mongo_id"),
        workspaceId: asWorkspaceId("also_invalid"),
      })
      .withPermission({
        organizationId: asOrganizationId("not_a_mongo_id"),
        workspaceId: asWorkspaceId("also_invalid"),
        roles: [],
        permissions: [],
      })
      .withQuery("Acme launch")
      .build();
    const result = await engine.snapshot(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.documents).toEqual([]);
  });
});
