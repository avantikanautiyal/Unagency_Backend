import { DefaultSdkRetryEngine } from "../../../../../src/platform/intelligence/providers/sdk/retries/default-retry-engine";
import { DefaultSdkTimeoutEngine } from "../../../../../src/platform/intelligence/providers/sdk/timeout/default-timeout-engine";
import {
  failure,
  success,
} from "../../../../../src/platform/intelligence/shared/result";
import {
  ProviderError,
  TimeoutError,
} from "../../../../../src/platform/intelligence/shared/errors";
import type { SdkRetryPolicy } from "../../../../../src/platform/intelligence/providers/sdk/contracts/policies";

const RETRY_POLICY: SdkRetryPolicy = {
  strategy: "fixed",
  maxAttempts: 3,
  baseDelayMs: 0,
};

describe("SDK retry engine", () => {
  it("retries until success", async () => {
    const engine = new DefaultSdkRetryEngine(() => Promise.resolve());
    let calls = 0;

    const outcome = await engine.execute(
      async () => {
        calls += 1;
        return calls < 2 ? failure(new ProviderError("retry")) : success("ok");
      },
      RETRY_POLICY,
      () => true
    );

    expect(outcome.attempts).toBe(2);
    expect(outcome.result.ok).toBe(true);
  });
});

describe("SDK timeout engine", () => {
  it("times out slow operations", async () => {
    const engine = new DefaultSdkTimeoutEngine();
    const slow = () =>
      new Promise((resolve) =>
        setTimeout(() => resolve(success("late")), 50)
      );

    const result = await engine.run(() => slow(), 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TimeoutError);
    }
  });
});
