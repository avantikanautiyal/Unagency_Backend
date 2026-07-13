import { createKnowledgeIntelligenceEngine } from "../../../../src/platform/intelligence/knowledge/factories/create-knowledge-engine";
import { sampleKnowledgeRequest } from "../../../../src/platform/intelligence/knowledge/testing";
import { KnowledgeRequestBuilder, knowledgeIdentityFromIds } from "../../../../src/platform/intelligence/knowledge/builders/knowledge-builders";
import { KnowledgeFilterEngine } from "../../../../src/platform/intelligence/knowledge/filtering/knowledge-filter";
import { KnowledgePermissionEngine } from "../../../../src/platform/intelligence/knowledge/permissions/permission-engine";
import { HybridRankingStrategy } from "../../../../src/platform/intelligence/knowledge/ranking/ranking-strategies";
import { KnowledgeSourceResolver } from "../../../../src/platform/intelligence/knowledge/sources/source-resolver";
import { createDefaultPlaceholderSources } from "../../../../src/platform/intelligence/knowledge/sources/placeholder-source";
import { KnowledgeRetriever } from "../../../../src/platform/intelligence/knowledge/retrieval/knowledge-retriever";
import { InMemoryKnowledgeCache } from "../../../../src/platform/intelligence/knowledge/caching/in-memory-knowledge-cache";
import { createContextIntelligenceEngine } from "../../../../src/platform/intelligence/context/factories/create-context-engine";
import { sampleContextBuildRequest } from "../../../../src/platform/intelligence/context/testing";

describe("KnowledgeIntelligenceEngine", () => {
  it("produces a knowledge snapshot", async () => {
    const engine = createKnowledgeIntelligenceEngine({ enableCache: false });
    const result = await engine.query(sampleKnowledgeRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot.documents.length).toBeGreaterThan(0);
    expect(result.value.snapshot.checksum).toBeTruthy();
    expect(result.value.sourceCount).toBeGreaterThan(0);
  });

  it("filters deprecated and expired documents", async () => {
    const engine = createKnowledgeIntelligenceEngine({ enableCache: false });
    const result = await engine.snapshot(sampleKnowledgeRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.documents.every((d) => d.metadata.deprecated !== true)
    ).toBe(true);
  });

  it("propagates identity into snapshot", async () => {
    const engine = createKnowledgeIntelligenceEngine({ enableCache: false });
    const result = await engine.snapshot(sampleKnowledgeRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.value.identity.organizationId)).toBe("org_1");
    expect(String(result.value.identity.capabilityId)).toBe("echo");
  });

  it("builds request from IntelligenceContext", async () => {
    const contextEngine = createContextIntelligenceEngine();
    const context = await contextEngine.build(sampleContextBuildRequest());
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    const request = KnowledgeRequestBuilder.fromIntelligenceContext(
      context.value,
      "brand"
    ).build();

    const engine = createKnowledgeIntelligenceEngine({ enableCache: false });
    const result = await engine.query(request);
    expect(result.ok).toBe(true);
  });

  it("uses cache on second query", async () => {
    const engine = createKnowledgeIntelligenceEngine({ enableCache: true });
    const request = sampleKnowledgeRequest();
    const first = await engine.snapshot(request);
    const second = await engine.snapshot(request);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.snapshotId).toBe(first.value.snapshotId);
    }
  });
});

describe("Knowledge pipeline components", () => {
  it("resolves sources", async () => {
    const sources = createDefaultPlaceholderSources();
    const resolver = new KnowledgeSourceResolver(sources);
    const resolved = await resolver.resolve(sampleKnowledgeRequest());
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.length).toBeGreaterThan(0);
    }
  });

  it("retrieves documents", async () => {
    const sources = createDefaultPlaceholderSources();
    const resolver = new KnowledgeSourceResolver(sources);
    const resolved = await resolver.resolve(sampleKnowledgeRequest());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const retriever = new KnowledgeRetriever(sources);
    const docs = await retriever.retrieve(
      sampleKnowledgeRequest(),
      resolved.value
    );
    expect(docs.ok).toBe(true);
    if (docs.ok) {
      expect(docs.value.length).toBeGreaterThan(0);
    }
  });

  it("ranks documents", async () => {
    const sources = createDefaultPlaceholderSources();
    const listed = await sources[0]!.listDocuments(sampleKnowledgeRequest());
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const ranked = await new HybridRankingStrategy().rank(listed.value);
    expect(ranked.ok).toBe(true);
    if (ranked.ok) {
      expect(ranked.value[0]?.score?.final).toBeDefined();
    }
  });

  it("filters documents", async () => {
    const sources = createDefaultPlaceholderSources();
    const resolved = await new KnowledgeSourceResolver(sources).resolve(
      sampleKnowledgeRequest()
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const all = await new KnowledgeRetriever(sources).retrieve(
      sampleKnowledgeRequest(),
      resolved.value
    );
    expect(all.ok).toBe(true);
    if (!all.ok) return;

    const filtered = await new KnowledgeFilterEngine().filter(all.value, {
      excludeDeprecated: true,
      excludeExpired: true,
    });
    expect(filtered.ok).toBe(true);
    if (filtered.ok) {
      expect(filtered.value.every((d) => !d.metadata.deprecated)).toBe(true);
    }
  });


  it("enforces permissions", async () => {
    const engine = new KnowledgePermissionEngine();
    const identity = knowledgeIdentityFromIds({
      organizationId: "org_1",
      workspaceId: "ws_1",
    });
    const denied = await engine.authorize({
      identity,
      permission: {
        organizationId: identity.organizationId,
        workspaceId: identity.workspaceId,
        roles: [],
        permissions: [],
      },
      filter: { requiredPermissions: ["knowledge.admin"] },
    });
    expect(denied.ok).toBe(false);
  });

  it("caches snapshots", async () => {
    const cache = new InMemoryKnowledgeCache();
    const engine = createKnowledgeIntelligenceEngine({ enableCache: false });
    const snapshot = await engine.snapshot(sampleKnowledgeRequest());
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;

    await cache.set("k1", snapshot.value, 60);
    const hit = await cache.get("k1");
    expect(hit?.snapshotId).toBe(snapshot.value.snapshotId);
  });
});
