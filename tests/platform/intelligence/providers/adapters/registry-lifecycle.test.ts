import {
  FakeTextAdapter,
  makeAdapterMetadata,
  makeManifest,
  setupAdapterPlatform,
  TEST_ADAPTER_ID,
  TEST_PROVIDER_ID,
  fixedNow,
} from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { InMemoryAdapterLifecycleManager } from "../../../../../src/platform/intelligence/providers/adapters/lifecycle/in-memory-lifecycle-manager";
import { asProviderAdapterId } from "../../../../../src/platform/intelligence/providers/adapters/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Adapter registry", () => {
  it("registers, resolves, describes, and lists adapters", () => {
    const { platform, adapter } = setupAdapterPlatform();

    const resolved = platform.registry.resolve(TEST_ADAPTER_ID);
    expect(resolved.ok).toBe(true);

    const byProvider = platform.registry.resolveByProvider(TEST_PROVIDER_ID);
    expect(byProvider.ok).toBe(true);

    const described = platform.registry.describe(TEST_ADAPTER_ID);
    if (!described.ok) throw described.error;
    expect(described.value.metadata.adapterId).toBe(TEST_ADAPTER_ID);

    expect(platform.registry.list()).toHaveLength(1);
    expect(adapter.describe().metadata.vendor).toBe("test");
  });

  it("rejects duplicate registration", () => {
    const { platform } = setupAdapterPlatform();
    const again = platform.registry.register(new FakeTextAdapter());
    expect(again.ok).toBe(false);
  });

  it("removes adapters", () => {
    const { platform } = setupAdapterPlatform();
    const removed = platform.registry.remove(TEST_ADAPTER_ID);
    expect(removed.ok).toBe(true);
    expect(platform.registry.resolve(TEST_ADAPTER_ID).ok).toBe(false);
  });

  it("fails to resolve an unknown adapter", () => {
    const { platform } = setupAdapterPlatform();
    const missing = platform.registry.resolve(asProviderAdapterId("nope"));
    expect(missing.ok).toBe(false);
  });

  it("rejects an adapter that fails validation", () => {
    const { platform } = setupAdapterPlatform();
    const badManifest = makeManifest();
    const bad = new FakeTextAdapter(badManifest, makeAdapterMetadata({
      adapterId: asProviderAdapterId("mismatch"),
      providerId: asProviderId("other-provider"),
    }));
    const result = platform.registry.register(bad);
    expect(result.ok).toBe(false);
  });
});

describe("Adapter lifecycle", () => {
  it("registers with initial state and transitions legally", () => {
    const lifecycle = new InMemoryAdapterLifecycleManager(fixedNow);
    lifecycle.register(TEST_ADAPTER_ID);
    expect(lifecycle.current(TEST_ADAPTER_ID)).toBe("registered");

    const toInit = lifecycle.transition(TEST_ADAPTER_ID, "initializing");
    expect(toInit.ok).toBe(true);
    const toReady = lifecycle.transition(TEST_ADAPTER_ID, "ready");
    expect(toReady.ok).toBe(true);
    expect(lifecycle.current(TEST_ADAPTER_ID)).toBe("ready");
  });

  it("rejects illegal transitions", () => {
    const lifecycle = new InMemoryAdapterLifecycleManager(fixedNow);
    lifecycle.register(TEST_ADAPTER_ID);
    lifecycle.transition(TEST_ADAPTER_ID, "retired");
    const illegal = lifecycle.transition(TEST_ADAPTER_ID, "ready");
    expect(illegal.ok).toBe(false);
  });

  it("fails to transition an unregistered adapter", () => {
    const lifecycle = new InMemoryAdapterLifecycleManager(fixedNow);
    const result = lifecycle.transition(asProviderAdapterId("ghost"), "ready");
    expect(result.ok).toBe(false);
  });
});
