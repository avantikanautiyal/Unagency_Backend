import { DefaultTransportRetryEngine } from "../../../../../src/platform/intelligence/providers/transport/retry/default-retry-engine";
import { DefaultTransportTimeoutEngine } from "../../../../../src/platform/intelligence/providers/transport/timeout/default-timeout-engine";
import {
  failure,
  success,
  type Result,
} from "../../../../../src/platform/intelligence/shared/result";
import {
  ProviderError,
  TimeoutError,
} from "../../../../../src/platform/intelligence/shared/errors";
import type { TransportRetryPolicy } from "../../../../../src/platform/intelligence/providers/transport/interfaces/engines";

const RETRY_POLICY: TransportRetryPolicy = {
  strategy: "fixed",
  maxAttempts: 3,
  baseDelayMs: 0,
};

describe("Transport retry engine", () => {
  it("retries retryable failures until success", async () => {
    const engine = new DefaultTransportRetryEngine(() => Promise.resolve());
    let calls = 0;

    const outcome = await engine.execute<string>(
      async () => {
        calls += 1;
        return calls < 3 ? failure(new ProviderError("boom")) : success("ok");
      },
      RETRY_POLICY,
      () => true
    );

    expect(outcome.attempts).toBe(3);
    expect(outcome.retries).toBe(2);
    expect(outcome.result.ok).toBe(true);
  });

  it("does not retry when the error is not retryable", async () => {
    const engine = new DefaultTransportRetryEngine(() => Promise.resolve());
    let calls = 0;

    const outcome = await engine.execute<string>(
      async () => {
        calls += 1;
        return failure(new ProviderError("nope"));
      },
      RETRY_POLICY,
      () => false
    );

    expect(calls).toBe(1);
    expect(outcome.attempts).toBe(1);
    expect(outcome.result.ok).toBe(false);
  });
});

describe("Transport timeout engine", () => {
  it("returns the operation result when it completes in time", async () => {
    const engine = new DefaultTransportTimeoutEngine();
    const result = await engine.run<string>(async () => success("fast"), 1000);
    expect(result.ok).toBe(true);
  });

  it("fails with a timeout error when the operation is too slow", async () => {
    const engine = new DefaultTransportTimeoutEngine();
    const slow = (): Promise<Result<string>> =>
      new Promise((resolve) => setTimeout(() => resolve(success("late")), 50));

    const result = await engine.run(slow, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TimeoutError);
    }
  });
});
