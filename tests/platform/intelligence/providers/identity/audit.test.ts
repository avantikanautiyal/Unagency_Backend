import {
  createTestPlatform,
  standardCredentialInput,
  standardSessionRequest,
} from "../../../../../src/platform/intelligence/providers/identity/testing";

describe("Audit events", () => {
  it("records credential_validated and credential_used on session creation", async () => {
    const { engine, store, audit } = createTestPlatform();
    await store.registerCredential(standardCredentialInput());

    await engine.createCredentialSession(standardSessionRequest());

    const types = audit.list().map((e) => e.type);
    expect(types).toContain("credential_validated");
    expect(types).toContain("credential_used");
  });

  it("never records raw secrets in audit metadata", async () => {
    const { engine, store, audit } = createTestPlatform();
    await store.registerCredential(standardCredentialInput());
    await engine.createCredentialSession(standardSessionRequest());

    const serialized = JSON.stringify(audit.list());
    expect(serialized).not.toContain("super-secret-value");
  });

  it("filters audit events by type", async () => {
    const { engine, store, audit } = createTestPlatform();
    await store.registerCredential(standardCredentialInput());
    await engine.createCredentialSession(standardSessionRequest());

    expect(audit.listByType("credential_used").length).toBeGreaterThan(0);
    expect(audit.listByType("credential_revoked")).toHaveLength(0);
  });
});
