/**
 * Generic execution reliability — application rate-limit accounting.
 */

import { InMemoryRateLimitService } from "../../../src/platform/api/rate-limits/in-memory-rate-limit-service";
import { resolveRateLimitCheckDimensions } from "../../../src/platform/execution-reliability/rate-limit-accounting";
import {
  mayAutoRetryProviderSubmission,
  reliabilityOutcomeFromAsyncErrorCode,
} from "../../../src/platform/execution-reliability/execution-outcome";
import { matchRoute } from "../../../src/platform/api/routes/route-map";

describe("execution reliability — rate-limit accounting", () => {
  it("USER_REQUEST and BACKGROUND_POLL use distinct dimensions", () => {
    const user = resolveRateLimitCheckDimensions({
      accountingClass: "USER_REQUEST",
      userId: "u1",
      organizationId: "o1",
    });
    const poll = resolveRateLimitCheckDimensions({
      accountingClass: "BACKGROUND_POLL",
      userId: "u1",
      organizationId: "o1",
    });
    expect(user.some((c) => c.dimension === "user")).toBe(true);
    expect(user.some((c) => c.dimension === "user_poll")).toBe(false);
    expect(poll.some((c) => c.dimension === "user_poll")).toBe(true);
    expect(poll.some((c) => c.dimension === "user")).toBe(false);
  });

  it("BACKGROUND_POLL does not consume USER_REQUEST user bucket", async () => {
    const rl = new InMemoryRateLimitService(
      () => "t",
      () => 1000,
      [
        { dimension: "user", limit: 2, windowMs: 60_000 },
        { dimension: "user_poll", limit: 100, windowMs: 60_000 },
        { dimension: "organization_poll", limit: 100, windowMs: 60_000 },
      ]
    );

    expect((await rl.check({ userId: "u1", accountingClass: "USER_REQUEST" })).ok).toBe(true);
    expect((await rl.check({ userId: "u1", accountingClass: "USER_REQUEST" })).ok).toBe(true);
    const thirdUser = await rl.check({ userId: "u1", accountingClass: "USER_REQUEST" });
    expect(thirdUser.ok && thirdUser.value.allowed).toBe(false);
    expect(thirdUser.ok && thirdUser.value.accountingClass).toBe("USER_REQUEST");

    // Polls still allowed — separate bucket.
    for (let i = 0; i < 10; i++) {
      const poll = await rl.check({
        userId: "u1",
        organizationId: "o1",
        accountingClass: "BACKGROUND_POLL",
      });
      expect(poll.ok && poll.value.allowed).toBe(true);
    }
  });

  it("application 429 decision carries structured provenance fields", async () => {
    const rl = new InMemoryRateLimitService(
      () => "t",
      () => 1000,
      [{ dimension: "user", limit: 1, windowMs: 60_000 }]
    );
    await rl.check({ userId: "u1", accountingClass: "USER_REQUEST" });
    const blocked = await rl.check({ userId: "u1", accountingClass: "USER_REQUEST" });
    expect(blocked.ok && blocked.value.allowed).toBe(false);
    if (!blocked.ok) return;
    expect(blocked.value.limit).toBe(1);
    expect(blocked.value.windowMs).toBe(60_000);
    expect(blocked.value.accountingClass).toBe("USER_REQUEST");
    expect(blocked.value.dimension).toBe("user");
  });

  it("GET execution status route is declared BACKGROUND_POLL", () => {
    const matched = matchRoute("GET", "/v1/executions/exec_abc");
    expect(matched?.route.rateLimitAccountingClass).toBe("BACKGROUND_POLL");
  });

  it("POST create execution remains USER_REQUEST (default)", () => {
    const matched = matchRoute("POST", "/v1/executions");
    expect(matched?.route.rateLimitAccountingClass).toBeUndefined();
  });

  it("unknown async outcomes must not auto-retry provider submission", () => {
    expect(mayAutoRetryProviderSubmission("PROVIDER_OUTCOME_UNKNOWN")).toBe(false);
    expect(mayAutoRetryProviderSubmission("APPLICATION_RATE_LIMITED")).toBe(false);
    expect(mayAutoRetryProviderSubmission("EXECUTION_PENDING")).toBe(false);
    expect(mayAutoRetryProviderSubmission("PROVIDER_FAILED")).toBe(true);
  });

  it("maps durable async error codes to reliability outcomes", () => {
    expect(reliabilityOutcomeFromAsyncErrorCode("provider_submit_stale")).toBe(
      "PROVIDER_OUTCOME_UNKNOWN"
    );
    expect(reliabilityOutcomeFromAsyncErrorCode("provider_poll_max_duration")).toBe(
      "PROVIDER_TIMEOUT"
    );
    expect(reliabilityOutcomeFromAsyncErrorCode("provider_job_timeout")).toBe(
      "PROVIDER_TIMEOUT"
    );
  });
});
