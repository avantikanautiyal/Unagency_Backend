import { ThrottleController } from "../../../../src/platform/infrastructure/execution/throttling/throttle-controller";

describe("ThrottleController per-minute window", () => {
  const limits = {
    organizationId: "org_throttle",
    workspaceId: "ws_throttle",
    maxConcurrent: 10,
    maxPerMinute: 3,
  };

  it("rolls the window over after a minute instead of capping for the process lifetime", () => {
    let now = 1_000_000;
    const throttle = new ThrottleController(() => now);

    for (let i = 0; i < 3; i += 1) {
      expect(throttle.tryEnter(limits)).toBe(true);
      throttle.exit(limits);
    }
    expect(throttle.tryEnter(limits)).toBe(false);

    now += 60_000;
    expect(throttle.tryEnter(limits)).toBe(true);
  });
});
