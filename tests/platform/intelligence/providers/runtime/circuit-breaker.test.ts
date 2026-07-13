import { CircuitBreaker } from "../../../../../src/platform/intelligence/providers/runtime/circuit-breaker/circuit-breaker";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("CircuitBreaker", () => {
  function makeBreaker(nowRef: { ms: number }) {
    return new CircuitBreaker({
      providerId: asProviderId("provider-a"),
      config: { failureThreshold: 3, successThreshold: 2, resetTimeoutMs: 100 },
      nowIso: () => new Date(nowRef.ms).toISOString(),
      nowMs: () => nowRef.ms,
    });
  }

  it("starts closed and allows dispatch", () => {
    const breaker = makeBreaker({ ms: 0 });
    expect(breaker.state.state).toBe("closed");
    expect(breaker.canDispatch()).toBe(true);
  });

  it("opens after reaching the failure threshold", () => {
    const breaker = makeBreaker({ ms: 0 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state.state).toBe("open");
    expect(breaker.canDispatch()).toBe(false);
  });

  it("transitions to half-open after the reset timeout", () => {
    const nowRef = { ms: 0 };
    const breaker = makeBreaker(nowRef);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.canDispatch()).toBe(false);

    nowRef.ms = 150;
    expect(breaker.canDispatch()).toBe(true);
    expect(breaker.state.state).toBe("half_open");
  });

  it("closes after enough successes in half-open", () => {
    const nowRef = { ms: 0 };
    const breaker = makeBreaker(nowRef);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    nowRef.ms = 150;
    breaker.canDispatch();
    breaker.recordSuccess();
    breaker.recordSuccess();
    expect(breaker.state.state).toBe("closed");
  });

  it("re-opens on failure while half-open", () => {
    const nowRef = { ms: 0 };
    const breaker = makeBreaker(nowRef);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    nowRef.ms = 150;
    breaker.canDispatch();
    breaker.recordFailure();
    expect(breaker.state.state).toBe("open");
  });
});
