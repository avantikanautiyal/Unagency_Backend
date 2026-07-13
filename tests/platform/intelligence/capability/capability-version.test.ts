import {
  CapabilityVersion,
  selectCapabilityVersion,
} from "../../../../src/platform/intelligence/capability-registry/contracts/capability-version";

describe("CapabilityVersion", () => {
  it("parses and compares versions", () => {
    const a = CapabilityVersion.parse("1.2.3");
    const b = CapabilityVersion.parse("1.3.0");
    expect(a.compare(b)).toBeLessThan(0);
    expect(b.isNewerThan(a)).toBe(true);
    expect(b.isCompatibleWith(a)).toBe(true);
  });

  it("rejects invalid versions", () => {
    expect(() => CapabilityVersion.parse("1.0")).toThrow();
  });

  it("selects latest and stable channels", () => {
    const versions = [
      CapabilityVersion.parse("1.0.0"),
      CapabilityVersion.parse("1.1.0"),
      CapabilityVersion.parse("2.0.0"),
    ];
    expect(selectCapabilityVersion(versions, "latest")?.toString()).toBe(
      "2.0.0"
    );
    expect(
      selectCapabilityVersion(versions, "stable", { stableMajor: 1 })?.toString()
    ).toBe("1.1.0");
  });
});
