import { InMemoryProviderHealthStore } from "../../../../src/platform/intelligence/providers/health/in-memory-provider-health-store";
import { asProviderId } from "../../../../src/platform/intelligence/shared/identifiers";

describe("Provider health contracts", () => {
  it("stores and lists health reports", () => {
    const store = new InMemoryProviderHealthStore();
    const providerId = asProviderId("provider-a");

    store.set({
      providerId,
      status: "healthy",
      checkedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(store.get(providerId)?.status).toBe("healthy");
    expect(store.list()).toHaveLength(1);

    store.set({
      providerId,
      status: "maintenance",
      checkedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(store.get(providerId)?.status).toBe("maintenance");
  });
});
