import { setupPersistence } from "../../../src/platform/persistence/testing";
import { ALL_ENTITY_COLLECTIONS } from "../../../src/platform/persistence/repositories/collections";
import { createPostgresAdapter, createMongodbAdapter } from "../../../src/platform/persistence/adapters/create-adapter";
import { LocalFieldEncryption } from "../../../src/platform/persistence/encryption/local-field-encryption";

describe("Enterprise Data Platform & Persistence", () => {
  it("exposes repositories for every required entity collection", async () => {
    const { engine } = setupPersistence();
    expect(ALL_ENTITY_COLLECTIONS.length).toBeGreaterThanOrEqual(20);
    for (const c of ALL_ENTITY_COLLECTIONS) {
      const repo = engine.repository(c);
      expect(repo.collection).toBe(c);
      const listed = await repo.list();
      expect(listed.ok).toBe(true);
    }
  });

  it("persists and lists organizations with organization scoping", async () => {
    const { engine } = setupPersistence();
    const orgs = engine.repository("organizations");
    const saved = await orgs.save(
      "org_1",
      { name: "Acme" },
      { organizationId: "org_1" }
    );
    expect(saved.ok && saved.value.version).toBe(1);

    const got = await orgs.get("org_1");
    expect(got.ok && got.value?.payload.name).toBe("Acme");

    const list = await orgs.list({ organizationId: "org_1" });
    expect(list.ok && list.value.length).toBe(1);
  });

  it("enforces optimistic concurrency", async () => {
    const { engine } = setupPersistence();
    const repo = engine.repository("campaigns");
    await repo.save("c1", { name: "A" }, { organizationId: "o1" });
    const conflict = await repo.save(
      "c1",
      { name: "B" },
      { organizationId: "o1", expectedVersion: 99 }
    );
    expect(conflict.ok).toBe(false);

    const ok = await repo.save(
      "c1",
      { name: "B" },
      { organizationId: "o1", expectedVersion: 1 }
    );
    expect(ok.ok && ok.value.version).toBe(2);
  });

  it("runs migrations with rollback and seeds", async () => {
    const { engine } = setupPersistence();
    const mig = engine.migrations();
    const up = await mig.migrate("test");
    expect(up.ok && up.value.length).toBeGreaterThanOrEqual(3);

    const applied = mig.applied("test");
    expect(applied.ok && applied.value.length).toBeGreaterThanOrEqual(3);

    const down = await mig.rollback("test", 1);
    expect(down.ok && down.value.length).toBe(1);

    const seed = await mig.seed("test", [
      {
        seedId: "seed_orgs",
        name: "demo orgs",
        collection: "organizations",
        rows: [{ id: "seed_org", name: "Seeded", organizationId: "seed_org" }],
      },
    ]);
    expect(seed.ok && seed.value.inserted).toBe(1);
  });

  it("coordinates unit of work / transactions", async () => {
    const { engine } = setupPersistence();
    const result = await engine.transactions().runInTransaction(async (uow) => {
      uow.register(async () => {
        await engine.repository("users").save(
          "u1",
          { email: "a@b.com" },
          { organizationId: "o1" }
        );
      });
      return { ok: true as const, value: "done" };
    });
    expect(result.ok && result.value).toBe("done");
    const user = await engine.repository("users").get("u1");
    expect(user.ok && user.value?.payload.email).toBe("a@b.com");
  });

  it("supports domain events, outbox, and replay", async () => {
    const { engine } = setupPersistence({ createId: (p) => `${p}_x` });
    const event = {
      eventId: "evt_1",
      aggregateType: "campaigns" as const,
      aggregateId: "c1",
      eventType: "campaign.created",
      payload: { name: "Launch" },
      occurredAt: "2026-07-15T00:00:00.000Z",
      organizationId: "o1",
    };
    const msg = await engine.outbox().enqueue(event);
    expect(msg.ok && msg.value.status).toBe("pending");

    const pending = await engine.outbox().listPending();
    expect(pending.ok && pending.value.length).toBe(1);

    await engine.outbox().markPublished(msg.ok ? msg.value.outboxId : "");
    const replay = await engine.events().replay();
    expect(replay.ok && replay.value.some((e) => e.eventId === "evt_1")).toBe(true);
  });

  it("encrypts sensitive fields", async () => {
    const { engine } = setupPersistence();
    const settings = engine.repository("settings");
    const saved = await settings.save(
      "s1",
      { apiToken: "super-secret", theme: "dark" },
      { organizationId: "o1", encryptFields: ["apiToken"] }
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // decrypted on read for consumers
    expect(saved.value.payload.apiToken).toBe("super-secret");

    const enc = engine.encryption().encrypt("x");
    expect(enc.ok && enc.value.startsWith("enc:")).toBe(true);
  });

  it("creates backups, restore points, and restores", async () => {
    const { engine } = setupPersistence();
    await engine.repository("brands").save(
      "b1",
      { name: "Nova" },
      { organizationId: "o1" }
    );

    const bak = await engine.backup().fullBackup();
    expect(bak.ok).toBe(true);
    if (!bak.ok) return;

    await engine.repository("brands").delete("b1");
    const gone = await engine.repository("brands").get("b1");
    expect(gone.ok && gone.value).toBeUndefined();

    const rp = await engine.backup().createRestorePoint(bak.value.backupId, "pre-delete");
    expect(rp.ok).toBe(true);
    if (!rp.ok) return;

    const restored = await engine.backup().restore(rp.value.restorePointId);
    expect(restored.ok && restored.value.restoredEntities).toBeGreaterThanOrEqual(1);

    const back = await engine.repository("brands").get("b1");
    expect(back.ok && back.value?.payload.name).toBe("Nova");
  });

  it("supports export/import and incremental backup", async () => {
    const { engine } = setupPersistence();
    await engine.repository("templates").save("t1", { name: "T" }, { organizationId: "o1" });
    const full = await engine.backup().fullBackup();
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    const incr = await engine.backup().incrementalBackup(full.value.backupId);
    expect(incr.ok && incr.value.kind).toBe("incremental");

    const exp = await engine.backup().exportAll();
    expect(exp.ok).toBe(true);
    if (!exp.ok) return;
    const other = setupPersistence();
    const imp = await other.engine.backup().importAll(exp.value.payload);
    expect(imp.ok && imp.value.imported).toBeGreaterThanOrEqual(1);
  });

  it("indexes for search without OpenSearch SDK", async () => {
    const { engine } = setupPersistence();
    await engine.search().index({
      indexName: "campaigns",
      documentId: "c1",
      organizationId: "o1",
      body: { name: "Summer Drop", objective: "awareness" },
    });
    const hits = await engine.search().search("campaigns", "summer", "o1");
    expect(hits.ok && hits.value.length).toBe(1);
  });

  it("provides redis cache and blob storage abstractions", async () => {
    const { engine } = setupPersistence();
    await engine.cache().set("k", "v", 60_000);
    const got = await engine.cache().get("k");
    expect(got.ok && got.value).toBe("v");

    await engine.blobs().put("files/a.txt", "hello", "text/plain");
    const blob = await engine.blobs().get("files/a.txt");
    expect(blob.ok && blob.value?.data).toBe("hello");
  });

  it("switches dialect via factory without changing repository usage", async () => {
    const pg = setupPersistence({ dialect: "postgres" });
    expect(pg.engine.dialect).toBe("postgres");
    const mongo = setupPersistence({ dialect: "mongodb" });
    expect(mongo.engine.dialect).toBe("mongodb");

    await pg.engine.repository("provider_catalog").save("openai", {
      displayName: "OpenAI",
    });
    const row = await pg.engine.repository("provider_catalog").get("openai");
    expect(row.ok && row.value?.payload.displayName).toBe("OpenAI");

    // Adapters expose same interface
    const enc = new LocalFieldEncryption();
    expect(createPostgresAdapter(() => "t", enc).dialect).toBe("postgres");
    expect(createMongodbAdapter(() => "t", enc).dialect).toBe("mongodb");
  });

  it("soft-deletes and supports execution history / experience / learning repos", async () => {
    const { engine } = setupPersistence();
    await engine.repository("executions").save("e1", { status: "succeeded" }, { organizationId: "o1" });
    await engine.repository("execution_history").save("h1", { executionId: "e1" }, { organizationId: "o1" });
    await engine.repository("experience").save("x1", { summary: "won" }, { organizationId: "o1" });
    await engine.repository("learning_artifacts").save("l1", { signal: 1 }, { organizationId: "o1" });
    await engine.repository("evaluation_reports").save("ev1", { score: 0.9 }, { organizationId: "o1" });

    await engine.repository("executions").delete("e1");
    const deleted = await engine.repository("executions").get("e1");
    expect(deleted.ok && deleted.value).toBeUndefined();
    const withDeleted = await engine.repository("executions").list({ includeDeleted: true });
    expect(withDeleted.ok && withDeleted.value.length).toBe(1);
  });
});
