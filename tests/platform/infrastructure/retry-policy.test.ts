import { classifyError } from "../../../src/platform/infrastructure/execution/retries/retry-policy";

describe("classifyError", () => {
  it("treats billing as fatal and circuit-open as provider (failover/cooldown)", () => {
    expect(classifyError("blackforestlabs HTTP 402")).toBe("fatal");
    expect(classifyError("circuit breaker is open")).toBe("provider");
    expect(classifyError("payment required")).toBe("fatal");
  });

  it("still classifies rate limits as provider retry class", () => {
    expect(classifyError("OpenAI HTTP 429")).toBe("provider");
  });
});
