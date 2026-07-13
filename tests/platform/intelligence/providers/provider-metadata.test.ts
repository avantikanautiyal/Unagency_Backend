import { ProviderBuilder } from "../../../../src/platform/intelligence/providers/metadata/provider-builder";
import { ProviderVersion } from "../../../../src/platform/intelligence/providers/versioning/provider-version";

describe("Provider metadata", () => {
  it("builds a complete provider definition", () => {
    const provider = ProviderBuilder.create(() => "2026-01-01T00:00:00.000Z")
      .withId("p1")
      .withVendor("vendor")
      .withDisplayName("Vendor Provider")
      .withVersion("2.1.0")
      .withModalities("text")
      .withStreamingSupport(true)
      .build();

    expect(provider.id).toBe("p1");
    expect(provider.streamingSupport).toBe(true);
    expect(ProviderVersion.parse(provider.version).toString()).toBe("2.1.0");
  });

  it("rejects invalid versions", () => {
    expect(() =>
      ProviderBuilder.create()
        .withId("p1")
        .withVendor("v")
        .withDisplayName("V")
        .withVersion("1")
        .withModalities("text")
        .build()
    ).toThrow();
  });
});
