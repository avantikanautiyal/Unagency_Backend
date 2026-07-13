import { PlaceholderSdkAuthenticationProvider } from "../../../../../src/platform/intelligence/providers/sdk/authentication/placeholder-auth-provider";

describe("SDK authentication provider", () => {
  const provider = new PlaceholderSdkAuthenticationProvider();

  it("validates api_key requires credentialRef", () => {
    const missing = provider.validate({ kind: "api_key" });
    expect(missing.ok).toBe(false);

    const ok = provider.validate({
      kind: "api_key",
      credentialRef: "cred_ref_1",
    });
    expect(ok.ok).toBe(true);
  });

  it("applies non-secret auth header hints", () => {
    const headers = provider.applyHeaders({
      kind: "bearer",
      credentialRef: "cred_ref_1",
    });
    expect(headers.ok).toBe(true);
    if (headers.ok) {
      expect(headers.value["x-auth-kind"]).toBe("bearer");
    }
  });

  it("refreshes authentication metadata", async () => {
    const refreshed = await provider.refresh({ kind: "oauth" });
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.value.metadata?.refreshed).toBe(true);
    }
  });
});
