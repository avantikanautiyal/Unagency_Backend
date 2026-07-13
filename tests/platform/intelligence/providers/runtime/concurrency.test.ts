import { ConcurrencyManager } from "../../../../../src/platform/intelligence/providers/runtime/concurrency/concurrency-manager";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("ConcurrencyManager", () => {
  const providerId = asProviderId("provider-a");

  it("reserves, acquires, and releases within capacity", () => {
    const manager = new ConcurrencyManager({ maxConcurrent: 2 });
    const r1 = manager.reserve("s1", providerId);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const lease = manager.acquire(r1.value, "owner");
    expect(lease.ok).toBe(true);
    expect(manager.active).toBe(1);
    expect(manager.reserved).toBe(0);

    if (lease.ok) {
      expect(manager.release(lease.value.leaseId).ok).toBe(true);
    }
    expect(manager.active).toBe(0);
  });

  it("denies reservations beyond capacity", () => {
    const manager = new ConcurrencyManager({ maxConcurrent: 1 });
    const r1 = manager.reserve("s1", providerId);
    expect(r1.ok).toBe(true);
    expect(manager.hasCapacity()).toBe(false);
    const r2 = manager.reserve("s2", providerId);
    expect(r2.ok).toBe(false);
  });

  it("counts reservations and leases toward capacity", () => {
    const manager = new ConcurrencyManager({ maxConcurrent: 2 });
    const r1 = manager.reserve("s1", providerId);
    const r2 = manager.reserve("s2", providerId);
    expect(r1.ok && r2.ok).toBe(true);
    expect(manager.hasCapacity()).toBe(false);
    expect(manager.reserved).toBe(2);
  });

  it("fails to acquire an unknown reservation", () => {
    const manager = new ConcurrencyManager({ maxConcurrent: 1 });
    const result = manager.acquire(
      {
        reservationId: "missing",
        sessionId: "s1",
        providerId,
        reservedAt: "2026-01-01T00:00:00.000Z",
      },
      "owner"
    );
    expect(result.ok).toBe(false);
  });
});
