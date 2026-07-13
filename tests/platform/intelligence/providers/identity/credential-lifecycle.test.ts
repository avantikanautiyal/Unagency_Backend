import {
  createTestPlatform,
  standardCredentialInput,
  TEST_ORG,
  TEST_PROVIDER,
  TEST_WORKSPACE,
} from "../../../../../src/platform/intelligence/providers/identity/testing";
import { asWorkspaceId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Credential lifecycle", () => {
  it("registers a credential without exposing the secret", async () => {
    const { store } = createTestPlatform();
    const result = await store.registerCredential(standardCredentialInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const credential = result.value;
    expect(credential.reference.providerId).toBe(TEST_PROVIDER);
    expect(credential.metadata.status).toBe("active");
    // The raw secret must NEVER appear anywhere on the credential record.
    const serialized = JSON.stringify(credential);
    expect(serialized).not.toContain("super-secret-value");
    expect(credential.reference.secretRef).not.toBe("super-secret-value");
  });

  it("stores the secret behind the secret provider only", async () => {
    const { store, secretProvider } = createTestPlatform();
    const result = await store.registerCredential(standardCredentialInput());
    if (!result.ok) throw result.error;

    const secret = await secretProvider.getSecret(
      result.value.reference.secretRef
    );
    expect(secret.ok).toBe(true);
    if (!secret.ok) return;
    expect(secret.value.value).toBe("super-secret-value");
  });

  it("resolves a registered credential by id", async () => {
    const { store } = createTestPlatform();
    const registered = await store.registerCredential(standardCredentialInput());
    if (!registered.ok) throw registered.error;

    const resolved = store.resolveCredential(
      registered.value.reference.credentialId
    );
    expect(resolved.ok).toBe(true);
  });

  it("fails to resolve an unknown credential", () => {
    const { store } = createTestPlatform();
    const resolved = store.resolveCredential(
      "cred-missing" as never
    );
    expect(resolved.ok).toBe(false);
  });

  it("revokes a credential", async () => {
    const { store } = createTestPlatform();
    const registered = await store.registerCredential(standardCredentialInput());
    if (!registered.ok) throw registered.error;

    const revoked = store.revokeCredential(
      registered.value.reference.credentialId
    );
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.value.metadata.status).toBe("revoked");
  });

  it("lists credentials with tenant filters", async () => {
    const { store } = createTestPlatform();
    await store.registerCredential(standardCredentialInput());
    await store.registerCredential(
      standardCredentialInput({
        scope: {
          organizationId: TEST_ORG,
          workspaceId: asWorkspaceId("ws-other"),
          providerId: TEST_PROVIDER,
        },
      })
    );

    const all = store.listCredentials({ providerId: TEST_PROVIDER });
    expect(all).toHaveLength(2);

    const scoped = store.listCredentials({
      providerId: TEST_PROVIDER,
      workspaceId: TEST_WORKSPACE,
    });
    expect(scoped).toHaveLength(1);
  });
});
