import { createArtifactEngine } from "../../../../src/platform/intelligence/artifacts/factories/create-artifact-engine";
import {
  ArtifactInputBuilder,
  artifactReference,
} from "../../../../src/platform/intelligence/artifacts/builders/artifact-input-builder";
import { InMemoryArtifactCollectionStore } from "../../../../src/platform/intelligence/artifacts/collections/in-memory-collection-store";
import { canTransitionArtifactLifecycle, ArtifactLifecycleManager } from "../../../../src/platform/intelligence/artifacts/lifecycle/artifact-lifecycle";
import { ArtifactLineageEngine } from "../../../../src/platform/intelligence/artifacts/lineage/lineage-engine";
import { ArtifactProvenanceEngine } from "../../../../src/platform/intelligence/artifacts/provenance/provenance-engine";
import { InMemoryArtifactRegistry } from "../../../../src/platform/intelligence/artifacts/registry/artifact-registry";
import {
  CanonicalJsonArtifactSerializer,
  JsonArtifactSerializer,
} from "../../../../src/platform/intelligence/artifacts/serialization/artifact-serializer";
import { PlaceholderArtifactSignatureEngine } from "../../../../src/platform/intelligence/artifacts/signatures/signature-engine";
import { ArtifactVersionEngine } from "../../../../src/platform/intelligence/artifacts/versioning/version-engine";
import {
  sampleExecutionArtifactInput,
  sampleParentReference,
} from "../../../../src/platform/intelligence/artifacts/testing";

describe("ArtifactEngine", () => {
  it("creates immutable execution artifacts with snapshots", async () => {
    const engine = createArtifactEngine();
    const result = await engine.create(sampleExecutionArtifactInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.artifact.identity.artifactId).toMatch(/^art_execution_/);
    expect(result.value.artifact.type).toBe("execution");
    expect(result.value.artifact.lifecycle).toBe("validated");
    expect(result.value.snapshot.snapshotId).toMatch(/^asnap_/);
    expect(result.value.snapshot.checksum).toHaveLength(64);
    expect(result.value.validation.valid).toBe(true);
    expect(result.value.artifact.signature.checksum).toHaveLength(64);
  });

  it("serializes artifacts as JSON and canonical JSON", async () => {
    const engine = createArtifactEngine();
    const created = await engine.create(sampleExecutionArtifactInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const json = engine.serialize(created.value.artifact, "json");
    const canonical = engine.serialize(created.value.artifact, "canonical_json");
    expect(json.ok).toBe(true);
    expect(canonical.ok).toBe(true);
    if (json.ok) expect(json.value).toContain("execution");
    if (canonical.ok) expect(canonical.value).not.toContain("\n");
  });
});

describe("Versioning", () => {
  it("resolves semver-style versions", () => {
    const engine = new ArtifactVersionEngine();
    const input = sampleExecutionArtifactInput();
    const version = engine.resolve(input, {
      ...input.identity,
      artifactId: "art_test",
      type: "execution",
    });
    expect(version.ok).toBe(true);
    if (!version.ok) return;
    expect(version.value.label).toBe("1.0.0+0");
    expect(version.value.state).toBe("draft");
  });

  it("bumps version parts", () => {
    const engine = new ArtifactVersionEngine();
    const base = {
      major: 1,
      minor: 0,
      patch: 0,
      revision: 0,
      label: "1.0.0+0",
      state: "draft" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const minor = engine.bump(base, "minor");
    expect(minor.minor).toBe(1);
    expect(minor.patch).toBe(0);
    const major = engine.bump(base, "major");
    expect(major.major).toBe(2);
    expect(major.minor).toBe(0);
  });
});

describe("Lineage", () => {
  it("builds lineage with parents and scope dimensions", () => {
    const lineageEngine = new ArtifactLineageEngine();
    const input = ArtifactInputBuilder.create()
      .withType("evaluation")
      .withScope({
        organizationId: "org_1",
        workspaceId: "ws_1",
        executionId: "exec_1",
        campaignId: "camp_1",
        projectId: "proj_1",
      })
      .withPayload({ evaluation: { reportId: "ereport_1" } })
      .withSourceModule("evaluation")
      .withParents([sampleParentReference()])
      .build();

    const identity = {
      artifactId: "art_eval_1",
      type: "evaluation" as const,
      organizationId: input.identity.organizationId,
      workspaceId: input.identity.workspaceId,
      executionId: input.identity.executionId,
      campaignId: "camp_1",
      projectId: "proj_1",
    };

    const lineage = lineageEngine.build(input, identity);
    expect(lineage.ok).toBe(true);
    if (!lineage.ok) return;
    expect(lineage.value.parents).toHaveLength(1);
    expect(lineage.value.executionId).toBe(input.identity.executionId);
    expect(lineage.value.campaignId).toBe("camp_1");
  });
});

describe("Provenance", () => {
  it("tracks provenance sources and module origin", () => {
    const provenanceEngine = new ArtifactProvenanceEngine();
    const input = sampleExecutionArtifactInput();
    const identity = {
      artifactId: "art_exec_1",
      type: "execution" as const,
      organizationId: input.identity.organizationId,
      workspaceId: input.identity.workspaceId,
      executionId: input.identity.executionId,
    };
    const lineageEngine = new ArtifactLineageEngine();
    const lineage = lineageEngine.build(input, identity);
    expect(lineage.ok).toBe(true);
    if (!lineage.ok) return;

    const provenance = provenanceEngine.build(input, identity, lineage.value);
    expect(provenance.ok).toBe(true);
    if (!provenance.ok) return;
    expect(provenance.value.createdByModule).toBe("execution-runtime");
    expect(provenance.value.sources.length).toBeGreaterThan(0);
  });
});

describe("Validation", () => {
  it("validates well-formed artifacts", async () => {
    const engine = createArtifactEngine();
    const result = await engine.create(sampleExecutionArtifactInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validation.valid).toBe(true);
    expect(result.value.validation.issues).toHaveLength(0);
  });
});

describe("Collections", () => {
  it("supports search, filter, group, and iterate", async () => {
    const engine = createArtifactEngine();
    const store = new InMemoryArtifactCollectionStore();
    const collection = store.create("test-collection");

    const exec = await engine.create(sampleExecutionArtifactInput());
    const ctx = await engine.create(
      ArtifactInputBuilder.create()
        .withType("context")
        .withScope({ organizationId: "org_1", workspaceId: "ws_1" })
        .withPayload({ context: { note: "ctx" } })
        .withSourceModule("context")
        .build()
    );
    expect(exec.ok && ctx.ok).toBe(true);
    if (!exec.ok || !ctx.ok) return;

    store.add(collection.collectionId, exec.value.snapshot);
    store.add(collection.collectionId, ctx.value.snapshot);

    const byType = store.search(collection.collectionId, { type: "execution" });
    expect(byType.ok).toBe(true);
    if (byType.ok) expect(byType.value).toHaveLength(1);

    const filtered = store.filter(
      collection.collectionId,
      (s) => s.artifact.type === "context"
    );
    expect(filtered.ok).toBe(true);
    if (filtered.ok) expect(filtered.value).toHaveLength(1);

    const grouped = store.groupBy(collection.collectionId, "type");
    expect(grouped.ok).toBe(true);
    if (grouped.ok) {
      expect(Object.keys(grouped.value)).toContain("execution");
      expect(Object.keys(grouped.value)).toContain("context");
    }

    const all = store.iterate(collection.collectionId);
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.value).toHaveLength(2);
  });
});

describe("Snapshots", () => {
  it("creates snapshots from existing artifacts", async () => {
    const engine = createArtifactEngine();
    const created = await engine.create(sampleExecutionArtifactInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const snapshot = engine.snapshot(created.value.artifact);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.artifact.identity.artifactId).toBe(
      created.value.artifact.identity.artifactId
    );
    expect(snapshot.value.manifest.manifestId).toMatch(/^aman_/);
  });
});

describe("Registry", () => {
  it("registers and resolves artifact types", () => {
    const registry = new InMemoryArtifactRegistry();
    const types = registry.list();
    expect(types.length).toBeGreaterThanOrEqual(15);

    const execution = registry.resolve("execution");
    expect(execution.ok).toBe(true);
    if (execution.ok) {
      expect(execution.value.displayName).toBe("ExecutionArtifact");
    }

    const custom = registry.register({
      type: "workflow",
      schemaVersion: "2.0.0",
      displayName: "CustomWorkflow",
      payloadKey: "workflow",
      supportsVersioning: true,
      supportsLineage: true,
    });
    expect(custom.ok).toBe(true);
  });
});

describe("Serialization", () => {
  it("round-trips JSON serialization", async () => {
    const engine = createArtifactEngine();
    const created = await engine.create(sampleExecutionArtifactInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const serializer = new JsonArtifactSerializer();
    const serialized = serializer.serialize(created.value.artifact);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;

    const deserialized = serializer.deserialize(serialized.value);
    expect(deserialized.ok).toBe(true);
    if (!deserialized.ok) return;
    expect(deserialized.value.type).toBe("execution");
  });

  it("produces canonical JSON", async () => {
    const engine = createArtifactEngine();
    const created = await engine.create(sampleExecutionArtifactInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const serializer = new CanonicalJsonArtifactSerializer();
    const serialized = serializer.serialize(created.value.artifact);
    expect(serialized.ok).toBe(true);
  });
});

describe("Lifecycle", () => {
  it("enforces immutable transitions", () => {
    expect(canTransitionArtifactLifecycle("created", "validated")).toBe(true);
    expect(canTransitionArtifactLifecycle("created", "published")).toBe(false);
    expect(canTransitionArtifactLifecycle("published", "superseded")).toBe(true);
    expect(canTransitionArtifactLifecycle("deleted", "active" as never)).toBe(false);
  });

  it("transitions artifact lifecycle state", async () => {
    const engine = createArtifactEngine();
    const created = await engine.create(sampleExecutionArtifactInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const manager = new ArtifactLifecycleManager();
    expect(created.value.artifact.lifecycle).toBe("validated");

    const published = manager.transition(created.value.artifact, "published");
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.value.lifecycle).toBe("published");
    }

    const invalid = manager.transition(created.value.artifact, "archived");
    expect(invalid.ok).toBe(false);
  });
});

describe("Signatures", () => {
  it("signs and verifies artifacts", async () => {
    const engine = createArtifactEngine();
    const created = await engine.create(sampleExecutionArtifactInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sigEngine = new PlaceholderArtifactSignatureEngine();
    const verified = sigEngine.verify(created.value.artifact);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.value).toBe(true);
  });

  it("builds artifacts with lineage references", async () => {
    const engine = createArtifactEngine();
    const parent = artifactReference("art_ctx_1", "context", "parent");
    const input = ArtifactInputBuilder.create()
      .withType("prompt")
      .withScope({
        organizationId: "org_1",
        workspaceId: "ws_1",
        executionId: "exec_1",
      })
      .withPayload({ prompt: { compilationId: "pc_1", templateId: "t1" } })
      .withSourceModule("prompt-compiler")
      .withParents([parent])
      .withDerivedFrom([parent])
      .build();

    const result = await engine.create(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.artifact.lineage.parents).toHaveLength(1);
    expect(result.value.artifact.lineage.derivedFrom).toHaveLength(1);
  });
});
