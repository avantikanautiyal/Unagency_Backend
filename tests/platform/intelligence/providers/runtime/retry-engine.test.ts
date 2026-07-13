import { RetryEngine } from "../../../../../src/platform/intelligence/providers/runtime/retry/retry-engine";
import type { RetryPolicy } from "../../../../../src/platform/intelligence/providers/runtime/contracts/retry-policy";

describe("RetryEngine", () => {
  const engine = new RetryEngine();

  it("never retries with strategy none", () => {
    const policy: RetryPolicy = { strategy: "none", maxAttempts: 5, baseDelayMs: 10 };
    expect(engine.shouldRetry(policy, 1)).toBe(false);
    expect(engine.nextDelayMs(policy, 1)).toBe(0);
  });

  it("retries up to maxAttempts", () => {
    const policy: RetryPolicy = { strategy: "fixed", maxAttempts: 3, baseDelayMs: 10 };
    expect(engine.shouldRetry(policy, 1)).toBe(true);
    expect(engine.shouldRetry(policy, 2)).toBe(true);
    expect(engine.shouldRetry(policy, 3)).toBe(false);
  });

  it("computes fixed backoff", () => {
    const policy: RetryPolicy = { strategy: "fixed", maxAttempts: 5, baseDelayMs: 100 };
    expect(engine.nextDelayMs(policy, 1)).toBe(100);
    expect(engine.nextDelayMs(policy, 3)).toBe(100);
  });

  it("computes linear backoff", () => {
    const policy: RetryPolicy = { strategy: "linear", maxAttempts: 5, baseDelayMs: 50 };
    expect(engine.nextDelayMs(policy, 1)).toBe(50);
    expect(engine.nextDelayMs(policy, 3)).toBe(150);
  });

  it("computes exponential backoff", () => {
    const policy: RetryPolicy = {
      strategy: "exponential",
      maxAttempts: 5,
      baseDelayMs: 100,
      multiplier: 2,
    };
    expect(engine.nextDelayMs(policy, 1)).toBe(100);
    expect(engine.nextDelayMs(policy, 2)).toBe(200);
    expect(engine.nextDelayMs(policy, 3)).toBe(400);
  });

  it("caps at maxDelayMs", () => {
    const policy: RetryPolicy = {
      strategy: "exponential",
      maxAttempts: 10,
      baseDelayMs: 100,
      multiplier: 10,
      maxDelayMs: 500,
    };
    expect(engine.nextDelayMs(policy, 3)).toBe(500);
  });

  it("returns zero for immediate strategy", () => {
    const policy: RetryPolicy = { strategy: "immediate", maxAttempts: 3, baseDelayMs: 100 };
    expect(engine.nextDelayMs(policy, 1)).toBe(0);
    expect(engine.shouldRetry(policy, 1)).toBe(true);
  });
});
