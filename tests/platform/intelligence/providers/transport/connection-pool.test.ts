import { InMemoryConnectionManager } from "../../../../../src/platform/intelligence/providers/transport/connection/in-memory-connection-manager";
import { InMemoryConnectionPool } from "../../../../../src/platform/intelligence/providers/transport/pooling/in-memory-connection-pool";
import { asPoolId } from "../../../../../src/platform/intelligence/providers/transport/contracts/identifiers";

describe("Connection manager", () => {
  it("reuses an idle keep-alive connection", () => {
    const manager = new InMemoryConnectionManager(
      () => "2026-01-01T00:00:00.000Z",
      (p) => `${p}_1`
    );

    const first = manager.acquire({ protocol: "local", keepAlive: true });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.useCount).toBe(1);

    manager.release(first.value.connectionId);
    const second = manager.acquire({ protocol: "local", keepAlive: true });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.connectionId).toBe(first.value.connectionId);
    expect(second.value.useCount).toBe(2);
  });

  it("fails to release an unknown connection", () => {
    const manager = new InMemoryConnectionManager();
    const result = manager.release("missing" as never);
    expect(result.ok).toBe(false);
  });
});

describe("Connection pool", () => {
  it("acquires within maxSize and reports stats", () => {
    const manager = new InMemoryConnectionManager();
    const pool = new InMemoryConnectionPool(
      asPoolId("pool_1"),
      "local",
      manager,
      2
    );

    const a = pool.acquire();
    expect(a.ok).toBe(true);
    expect(pool.stats().active).toBe(1);
    if (a.ok) {
      pool.release(a.value);
      expect(pool.stats().active).toBe(0);
    }
  });

  it("rejects acquisition when the pool is exhausted", () => {
    const manager = new InMemoryConnectionManager();
    const pool = new InMemoryConnectionPool(
      asPoolId("pool_2"),
      "local",
      manager,
      1
    );

    expect(pool.acquire().ok).toBe(true);
    const exhausted = pool.acquire();
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) {
      expect(exhausted.error.message).toMatch(/exhausted/);
    }
  });
});
