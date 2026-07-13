import { canTransitionCapabilityStatus } from "../../../../src/platform/intelligence/capability-registry/contracts/capability-status";

describe("Capability lifecycle transitions", () => {
  it("allows draft to published", () => {
    expect(canTransitionCapabilityStatus("draft", "published")).toBe(true);
  });

  it("allows published to deprecated", () => {
    expect(canTransitionCapabilityStatus("published", "deprecated")).toBe(true);
  });

  it("rejects archived to published", () => {
    expect(canTransitionCapabilityStatus("archived", "published")).toBe(false);
  });

  it("allows disabled to draft", () => {
    expect(canTransitionCapabilityStatus("disabled", "draft")).toBe(true);
  });
});
