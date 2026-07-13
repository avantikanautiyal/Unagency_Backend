import {
  createTestPlatform,
  standardCredentialInput,
  standardSessionRequest,
  TEST_ORG,
  TEST_PROVIDER,
} from "../../../../../src/platform/intelligence/providers/identity/testing";
import { CreateCredentialSessionRequestBuilder } from "../../../../../src/platform/intelligence/providers/identity/builders/create-credential-session-request-builder";
import { asWorkspaceId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Authorization + permission checks", () => {
  it("denies a session when required permissions are missing", async () => {
    const { engine, store } = createTestPlatform();
    await store.registerCredential(
      standardCredentialInput({ permissions: ["read"] })
    );

    const request = new CreateCredentialSessionRequestBuilder()
      .withProvider(TEST_PROVIDER)
      .withOrganization(TEST_ORG)
      .withWorkspace(asWorkspaceId("ws-1"))
      .withRequiredPermissions(["read", "manage"])
      .build();

    const result = await engine.createCredentialSession(request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHORIZATION_ERROR");
  });

  it("grants only the requested permissions", async () => {
    const { engine, store } = createTestPlatform();
    await store.registerCredential(
      standardCredentialInput({ permissions: ["read", "execute", "audit"] })
    );

    const result = await engine.createCredentialSession(
      standardSessionRequest()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.grantedPermissions).toEqual(["read", "execute"]);
    expect(result.value.grantedPermissions).not.toContain("audit");
  });
});

describe("Tenant isolation", () => {
  it("does not resolve a credential registered for another workspace", async () => {
    const { engine, store } = createTestPlatform();
    await store.registerCredential(
      standardCredentialInput({
        scope: {
          organizationId: TEST_ORG,
          workspaceId: asWorkspaceId("ws-other"),
          providerId: TEST_PROVIDER,
        },
      })
    );

    // Requesting for ws-1 must not see the ws-other credential.
    const result = await engine.createCredentialSession(
      standardSessionRequest()
    );
    expect(result.ok).toBe(false);
  });
});
