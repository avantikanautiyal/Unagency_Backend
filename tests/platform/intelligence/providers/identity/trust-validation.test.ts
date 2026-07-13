import {
  createTestPlatform,
  standardCredentialInput,
  standardSessionRequest,
  TEST_ORG,
  TEST_PROVIDER,
} from "../../../../../src/platform/intelligence/providers/identity/testing";
import { CreateCredentialSessionRequestBuilder } from "../../../../../src/platform/intelligence/providers/identity/builders/create-credential-session-request-builder";
import { asWorkspaceId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Trust validation", () => {
  it("rejects credentials below the minimum trust level", async () => {
    const { engine, store } = createTestPlatform({ minTrustLevel: "high" });
    await store.registerCredential(
      standardCredentialInput({ trustLevel: "low" })
    );

    const result = await engine.createCredentialSession(
      standardSessionRequest()
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SECURITY_ERROR");
  });

  it("enforces region constraints", async () => {
    const { engine, store } = createTestPlatform();
    await store.registerCredential(
      standardCredentialInput({
        regionConstraint: { allowedRegions: ["us-east-1"] },
      })
    );

    const request = new CreateCredentialSessionRequestBuilder()
      .withProvider(TEST_PROVIDER)
      .withOrganization(TEST_ORG)
      .withWorkspace(asWorkspaceId("ws-1"))
      .withRegion("eu-west-1")
      .build();

    const result = await engine.createCredentialSession(request);
    expect(result.ok).toBe(false);
  });

  it("accepts an allowed region", async () => {
    const { engine, store } = createTestPlatform();
    await store.registerCredential(
      standardCredentialInput({
        regionConstraint: { allowedRegions: ["us-east-1"] },
      })
    );

    const request = new CreateCredentialSessionRequestBuilder()
      .withProvider(TEST_PROVIDER)
      .withOrganization(TEST_ORG)
      .withWorkspace(asWorkspaceId("ws-1"))
      .withRegion("us-east-1")
      .build();

    const result = await engine.createCredentialSession(request);
    expect(result.ok).toBe(true);
  });
});

describe("Credential validation dimensions", () => {
  it("fails validation for an expired credential", async () => {
    const { engine, store, clock } = createTestPlatform();
    await store.registerCredential(
      standardCredentialInput({
        expiresAt: new Date(clock.now().getTime() - 1000).toISOString(),
      })
    );

    const result = await engine.createCredentialSession(
      standardSessionRequest()
    );
    expect(result.ok).toBe(false);
  });
});
