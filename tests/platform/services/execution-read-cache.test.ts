/**
 * Large finished executions are downloaded once, not on every poll.
 */

const findOne = jest.fn();
jest.mock("../../../src/platform/infrastructure/durability/mongo/models/enterprise-execution.model", () => ({
  EnterpriseExecution: { findOne: (...a: unknown[]) => findOne(...a) },
}));
jest.mock("../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model", () => ({ EnterpriseArtifact: {} }));
jest.mock("../../../src/platform/infrastructure/durability/mongo/models/enterprise-execution-extras.model", () => ({ EnterpriseExecutionExtras: {} }));

import {
  MongoExecutionRepository,
  resetExecutionReadCacheForTests,
} from "../../../src/platform/infrastructure/durability/repositories/mongo-execution-persistence";

const query = (value: unknown, gate?: Promise<void>) => {
  const q: Record<string, unknown> = {};
  q.maxTimeMS = () => q;
  q.lean = async () => {
    if (gate) await gate;
    if (value instanceof Error) throw value;
    return value;
  };
  return q;
};
const fullReads = () => findOne.mock.calls.filter((c) => c[1] === undefined).length;

describe("MongoExecutionRepository.get", () => {
  beforeEach(() => {
    findOne.mockReset();
    resetExecutionReadCacheForTests();
  });

  it("shares one database read between concurrent polls", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    findOne.mockImplementation(() =>
      query({ executionId: "e1", status: "running", updatedAt: "t1" }, gate),
    );
    const repo = new MongoExecutionRepository();
    const polls = [repo.get("e1"), repo.get("e1"), repo.get("e1")];
    open();
    const out = await Promise.all(polls);
    expect(out.every((d) => d?.status === "running")).toBe(true);
    expect(fullReads()).toBe(1);
  });

  it("downloads a finished execution once and re-validates it with a small read", async () => {
    const doc = { executionId: "e2", status: "succeeded", result: { big: "x" } };
    let stored = "t1";
    findOne.mockImplementation((_f: unknown, projection?: unknown) =>
      query(projection ? { status: "succeeded", updatedAt: stored } : { ...doc, updatedAt: stored }),
    );
    const repo = new MongoExecutionRepository();
    await repo.get("e2");
    await repo.get("e2");
    const third = await repo.get("e2");
    expect(third).toMatchObject({ executionId: "e2", result: { big: "x" } });
    expect(fullReads()).toBe(1);

    // Changed elsewhere → the stale copy is not served.
    stored = "t2";
    await repo.get("e2");
    expect(fullReads()).toBe(2);
  });

  it("does not hammer the database after a failed read", async () => {
    findOne.mockImplementation(() => query(new Error("connection 28 timed out")));
    const repo = new MongoExecutionRepository();
    await expect(repo.get("e3")).rejects.toThrow("timed out");
    await expect(repo.get("e3")).rejects.toThrow("timed out");
    await expect(repo.get("e3")).rejects.toThrow("timed out");
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});
