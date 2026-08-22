import { createMemoryIntelligenceEngine } from "../../../src/platform/intelligence/memory/factories/create-memory-engine";
import { InMemoryMemoryStore } from "../../../src/platform/intelligence/memory/stores/in-memory-memory-store";
import {
  sampleMemoryIngestInput,
  sampleMemoryRequest,
} from "../../../src/platform/intelligence/memory/testing";
import { createInMemoryOsDurableBundle } from "../../../src/platform/infrastructure/durability/create-os-durable-bundle";
import { createOsDeliveryService } from "../../../src/platform/os/delivery/engine/delivery-service";
import { OsProductionWorker } from "../../../src/platform/os/runtime/os-production-worker";
import { createOsProductionRuntime } from "../../../src/platform/os/runtime/os-production-runtime";
import { createEnterpriseApiPlatform } from "../../../src/platform/api/factories/create-enterprise-api-platform";
import { getSharedTestDurableStores, resetSharedTestDurableStores } from "../../../src/platform/infrastructure/durability";

describe("wave3 — memory store filters", () => {
  it("filters records by org, scope, and classification", async () => {
    const store = new InMemoryMemoryStore();
    const engine = createMemoryIntelligenceEngine({ store });
    await engine.ingest(sampleMemoryIngestInput());
    const listed = await store.list({
      ...sampleMemoryRequest(),
      classifications: ["response"],
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.every((r) => r.classification === "response")).toBe(true);
  });
});

describe("wave3 — memory engine with injected store", () => {
  it("persists through a custom store adapter", async () => {
    const store = new InMemoryMemoryStore();
    const engine = createMemoryIntelligenceEngine({ store });
    await engine.ingest(sampleMemoryIngestInput());
    const result = await engine.query(sampleMemoryRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot.records.length).toBeGreaterThan(0);
    const listed = await store.list(sampleMemoryRequest());
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThan(0);
  });
});

describe("wave3 — OS production worker wiring", () => {
  afterEach(() => {
    resetSharedTestDurableStores();
  });

  it("platform wires queued delivery + background worker when os bundle present", async () => {
    const stores = getSharedTestDurableStores();
    expect(stores.os).toBeTruthy();

    const platform = createEnterpriseApiPlatform({
      executionMode: "stub",
      durableStores: stores,
    });

    expect(platform.osProductionWorker).toBeDefined();
    expect(platform.osRuntime).toBeDefined();
    expect(platform.executions.getTaskGraphExecutor()).toBeTruthy();

    const delivery = createOsDeliveryService({
      artifacts: stores.os!.artifacts,
      receipts: stores.os!.deliveries,
      mode: "queued",
      onQueued: async (receipt) => {
        await platform.osRuntime.enqueueDelivery(receipt);
      },
    });

    const runtime = createOsProductionRuntime({
      queue: stores.os!.workQueue,
      executor: platform.executions.getTaskGraphExecutor(),
      delivery,
      resolvePlan: async () => undefined,
    });

    const worker = new OsProductionWorker({ runtime, tickIntervalMs: 50 });
    await worker.tick();
    await platform.osProductionWorker?.shutdown();
    await worker.shutdown();
  });

  it("uses in-memory os bundle from shared test stores", () => {
    const bundle = createInMemoryOsDurableBundle();
    expect(bundle.composition).toBe("in-memory");
    expect(bundle.deliveries).toBeTruthy();
    expect(bundle.workQueue).toBeTruthy();
  });
});
