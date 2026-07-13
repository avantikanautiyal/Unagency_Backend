import { createMemoryIntelligenceEngine } from "../../../../src/platform/intelligence/memory/factories/create-memory-engine";
import {
  sampleMemoryIngestInput,
  sampleMemoryIdentity,
  sampleMemoryRequest,
} from "../../../../src/platform/intelligence/memory/testing";
import { MemoryScopeResolver } from "../../../../src/platform/intelligence/memory/scopes/scope-resolver";
import { MemoryRetentionEngine } from "../../../../src/platform/intelligence/memory/retention/retention-engine";
import {
  DeduplicateCompressionStrategy,
  ImportanceRankingCompressionStrategy,
} from "../../../../src/platform/intelligence/memory/compression/compression-strategies";
import { InMemoryMemoryStore } from "../../../../src/platform/intelligence/memory/stores/in-memory-memory-store";
import { MemoryRetriever } from "../../../../src/platform/intelligence/memory/retrieval/memory-retriever";
import {
  MemoryRecordBuilder,
  MemorySnapshotBuilder,
  artifactsFromExecution,
  memoryIdentityFromIds,
} from "../../../../src/platform/intelligence/memory/builders/memory-builders";
import { canTransitionMemoryLifecycle } from "../../../../src/platform/intelligence/memory/lifecycle/memory-lifecycle";

describe("MemoryIntelligenceEngine", () => {
  it("ingests artifacts into a memory snapshot", async () => {
    const engine = createMemoryIntelligenceEngine();
    const result = await engine.ingest(sampleMemoryIngestInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.storedCount).toBe(3);
    expect(result.value.snapshot.records.length).toBeGreaterThan(0);
    expect(result.value.snapshot.checksum).toBeTruthy();
  });

  it("queries by scope and classification", async () => {
    const engine = createMemoryIntelligenceEngine();
    await engine.ingest(sampleMemoryIngestInput());

    const result = await engine.query({
      ...sampleMemoryRequest(),
      classifications: ["response"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.snapshot.records.every((r) => r.classification === "response")
    ).toBe(true);
  });

  it("propagates identity into records", async () => {
    const engine = createMemoryIntelligenceEngine();
    const result = await engine.ingest(sampleMemoryIngestInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(String(result.value.snapshot.identity.organizationId)).toBe("org_1");
    expect(String(result.value.snapshot.identity.sessionId)).toBe("session_1");
  });
});

describe("Memory components", () => {
  it("resolves scopes", () => {
    const resolver = new MemoryScopeResolver();
    const scope = resolver.resolve(sampleMemoryIngestInput());
    expect(scope.ok).toBe(true);
    if (scope.ok) {
      expect(scope.value.kind).toBe("session");
    }
  });

  it("classifies retention", () => {
    const retention = new MemoryRetentionEngine();
    expect(retention.classifyRetention("prompt").retentionClass).toBe(
      "short_term"
    );
    expect(retention.classifyRetention("brand_asset").retentionClass).toBe(
      "long_term"
    );
  });

  it("deduplicates records", async () => {
    const identity = sampleMemoryIdentity();
    const scope = {
      kind: "session" as const,
      scopeId: "session_1",
      parentScopeId: "ws_1",
    };
    const record = MemoryRecordBuilder.create()
      .withIdentity(identity)
      .withScope(scope)
      .withClassification("response")
      .withContent({ message: "Hello" })
      .build();

    const compressed = await new DeduplicateCompressionStrategy().compress([
      record,
      { ...record, id: "mem_dup" },
    ]);
    expect(compressed.ok).toBe(true);
    if (compressed.ok) {
      expect(compressed.value).toHaveLength(1);
    }
  });

  it("ranks by importance", async () => {
    const identity = sampleMemoryIdentity();
    const scope = {
      kind: "workspace" as const,
      scopeId: "ws_1",
    };
    const low = MemoryRecordBuilder.create()
      .withIdentity(identity)
      .withScope(scope)
      .withClassification("execution")
      .withContent({ a: 1 })
      .withImportance(1)
      .build();
    const high = MemoryRecordBuilder.create()
      .withIdentity(identity)
      .withScope(scope)
      .withClassification("decision")
      .withContent({ b: 2 })
      .withImportance(10)
      .build();

    const ranked = await new ImportanceRankingCompressionStrategy().compress([
      low,
      high,
    ]);
    expect(ranked.ok).toBe(true);
    if (ranked.ok) {
      expect(ranked.value[0]?.importance).toBe(10);
    }
  });

  it("stores and retrieves records", async () => {
    const store = new InMemoryMemoryStore();
    const retriever = new MemoryRetriever(store);
    const identity = memoryIdentityFromIds({
      organizationId: "org_1",
      workspaceId: "ws_1",
    });
    const record = MemoryRecordBuilder.create()
      .withIdentity(identity)
      .withScope({ kind: "organization", scopeId: "org_1" })
      .withClassification("knowledge")
      .withContent({ note: "x" })
      .build();

    await store.save(record);
    const listed = await retriever.retrieve({
      identity,
      classifications: ["knowledge"],
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value).toHaveLength(1);
    }
  });

  it("builds snapshots", () => {
    const identity = sampleMemoryIdentity();
    const record = MemoryRecordBuilder.create()
      .withIdentity(identity)
      .withScope({ kind: "session", scopeId: "session_1" })
      .withClassification("prompt")
      .withContent({ text: "hi" })
      .build();

    const snapshot = MemorySnapshotBuilder.create()
      .withIdentity(identity)
      .withRecords([record])
      .build();

    expect(snapshot.snapshotId).toMatch(/^msnap_/);
    expect(snapshot.checksum).toBeTruthy();
  });

  it("supports lifecycle transitions", () => {
    expect(canTransitionMemoryLifecycle("active", "archived")).toBe(true);
    expect(canTransitionMemoryLifecycle("deleted", "active")).toBe(false);
  });

  it("builds artifacts from execution outputs", () => {
    const artifacts = artifactsFromExecution({
      response: { message: "Hello" },
      execution: { state: "completed" },
    });
    expect(artifacts.map((a) => a.classification)).toEqual([
      "execution",
      "response",
    ]);
  });
});
