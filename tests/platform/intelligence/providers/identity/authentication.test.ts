import { ProviderAuthenticationEngine } from "../../../../../src/platform/intelligence/providers/identity/authentication/authentication-engine";
import type { ProviderCredential } from "../../../../../src/platform/intelligence/providers/identity/contracts/credential";
import { asCredentialId } from "../../../../../src/platform/intelligence/providers/identity/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

function credential(
  scheme: ProviderCredential["reference"]["scheme"],
  status: ProviderCredential["metadata"]["status"] = "active"
): ProviderCredential {
  const credentialId = asCredentialId("cred-1");
  const providerId = asProviderId("provider-1");
  return {
    reference: { credentialId, providerId, scheme, secretRef: "sref-1" },
    metadata: {
      credentialId,
      providerId,
      scheme,
      tenancy: "organization",
      scope: { providerId },
      trustLevel: "high",
      status,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    permissions: ["read", "execute"],
  };
}

describe("ProviderAuthenticationEngine (placeholder, no networking)", () => {
  const engine = new ProviderAuthenticationEngine();

  it("supports all documented schemes", () => {
    for (const scheme of [
      "api_key",
      "oauth2",
      "bearer_token",
      "jwt",
      "service_account",
      "client_credentials",
      "anonymous",
    ] as const) {
      expect(engine.supports(scheme)).toBe(true);
    }
  });

  it("authenticates when the secret is present", () => {
    const result = engine.authenticate({
      credential: credential("api_key"),
      secretPresent: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.authenticated).toBe(true);
  });

  it("fails when the secret is missing for a secret-bearing scheme", () => {
    const result = engine.authenticate({
      credential: credential("api_key"),
      secretPresent: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.authenticated).toBe(false);
  });

  it("authenticates anonymous without a secret", () => {
    const result = engine.authenticate({
      credential: credential("anonymous"),
      secretPresent: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.authenticated).toBe(true);
  });

  it("fails when the credential is not active", () => {
    const result = engine.authenticate({
      credential: credential("api_key", "revoked"),
      secretPresent: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.authenticated).toBe(false);
  });
});
