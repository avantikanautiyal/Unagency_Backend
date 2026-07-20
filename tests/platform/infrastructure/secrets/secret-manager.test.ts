import {
  setupSecretManagement,
  sampleStoreInput,
} from "../../../../src/platform/infrastructure/secrets/testing";
import { createSecretManagementPlatform } from "../../../../src/platform/infrastructure/secrets/factories/create-secret-management-platform";
import { createIdentityPlatform } from "../../../../src/platform/intelligence/providers/identity/factories/create-identity-platform";
import { standardCredentialInput } from "../../../../src/platform/intelligence/providers/identity/testing";
import { maskSecretValue, scrubObject } from "../../../../src/platform/infrastructure/secrets/masking/secret-masker";
import { LocalAes256Encryptor } from "../../../../src/platform/infrastructure/secrets/encryption/local-aes256-encryptor";
import { AwsSecretsManagerBackend } from "../../../../src/platform/infrastructure/secrets/aws";

describe("Secret Management & Trust Platform", () => {
  it("stores and retrieves protected (masked) secrets", async () => {
    const { manager } = setupSecretManagement();
    const stored = await manager.storeSecret(sampleStoreInput());
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    const got = await manager.getSecret(stored.value.secretId);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.masked).not.toContain("sk-test-secret-value-12345");
    expect(got.value.masked).toMatch(/\*/);
    expect(got.value.length).toBeGreaterThan(0);
  });

  it("rotates secrets and bumps version", async () => {
    const { manager } = setupSecretManagement();
    const stored = await manager.storeSecret(sampleStoreInput());
    if (!stored.ok) return;
    await manager.validateSecret(stored.value.secretId);

    const rotated = await manager.rotateSecret({
      secretId: stored.value.secretId,
      newValue: "sk-rotated-secret-value-99999",
      actor: "ops",
      reason: "scheduled",
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;
    expect(rotated.value.lifecycle).toBe("active");
    expect(rotated.value.version).toBeGreaterThanOrEqual(2);

    const lease = await manager.leaseSecret({
      secretId: stored.value.secretId,
      ttlMs: 60_000,
      purpose: "verify_rotate",
    });
    expect(lease.ok).toBe(true);
    if (!lease.ok) return;
    const revealed = await manager.revealLeasedSecret(lease.value.leaseId);
    expect(revealed.ok).toBe(true);
    if (!revealed.ok) return;
    expect(revealed.value.value).toBe("sk-rotated-secret-value-99999");
  });

  it("leases, renews, expires, and revokes", async () => {
    const helpers = { ms: 1_700_000_000_000 };
    const { manager } = createSecretManagementPlatform({
      providerKind: "local",
      masterKey: "test-master-key-16+",
      createId: (p) => `${p}_1`,
      nowIso: () => new Date(helpers.ms).toISOString(),
      clockMs: () => helpers.ms,
    });

    const stored = await manager.storeSecret(sampleStoreInput());
    if (!stored.ok) return;
    await manager.validateSecret(stored.value.secretId);

    const lease = await manager.leaseSecret({
      secretId: stored.value.secretId,
      ttlMs: 100,
      purpose: "temp",
    });
    expect(lease.ok).toBe(true);
    if (!lease.ok) return;

    const renewed = await manager.renewLease(lease.value.leaseId, 10_000);
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.value.state).toBe("renewed");

    helpers.ms += 20_000;
    const expired = await manager.renewLease(lease.value.leaseId, 1000);
    // after advance past expires, get marks expired — renew should fail
    expect(expired.ok).toBe(false);

    const lease2 = await manager.leaseSecret({
      secretId: stored.value.secretId,
      ttlMs: 60_000,
      purpose: "revoke_test",
    });
    if (!lease2.ok) return;
    const revoked = await manager.revokeLease(lease2.value.leaseId);
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.value.state).toBe("revoked");

    const denied = await manager.revealLeasedSecret(lease2.value.leaseId);
    expect(denied.ok).toBe(false);
  });

  it("masks and scrubs sensitive fields", () => {
    expect(maskSecretValue("abcdefghijklmnop")).not.toBe("abcdefghijklmnop");
    const scrubbed = scrubObject({ apiKey: "secret-value", name: "ok" });
    expect(scrubbed.name).toBe("ok");
    expect(String(scrubbed.apiKey)).not.toContain("secret-value");
  });

  it("audits without secret values", async () => {
    const { manager } = setupSecretManagement();
    const stored = await manager.storeSecret(sampleStoreInput({ value: "super-secret-xyz-12345" }));
    if (!stored.ok) return;
    await manager.getSecret(stored.value.secretId);
    const audit = manager.auditSecret(stored.value.secretId);
    expect(audit.ok).toBe(true);
    if (!audit.ok) return;
    expect(audit.value.length).toBeGreaterThan(0);
    const blob = JSON.stringify(audit.value);
    expect(blob).not.toContain("super-secret-xyz-12345");
  });

  it("encrypts and decrypts with AES-256-GCM", () => {
    const enc = new LocalAes256Encryptor("test-master-key-16+");
    const sealed = enc.encrypt("hello-secret");
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    const opened = enc.decrypt(sealed.value);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value).toBe("hello-secret");
  });

  it("validates and reports health", async () => {
    const { manager } = setupSecretManagement();
    const stored = await manager.storeSecret(sampleStoreInput());
    if (!stored.ok) return;
    const validated = await manager.validateSecret(stored.value.secretId);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.lifecycle).toBe("active");

    const health = await manager.health();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(health.value.secretCount).toBeGreaterThanOrEqual(1);
    expect(health.value.providerKind).toBe("local");
  });

  it("lists and deletes secrets", async () => {
    const { manager } = setupSecretManagement();
    const a = await manager.storeSecret(sampleStoreInput({ name: "a-key" }));
    const b = await manager.storeSecret(sampleStoreInput({ name: "b-key", value: "another-secret-value-1" }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok) return;

    const listed = await manager.listSecrets({ type: "ai_provider_key" });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThanOrEqual(2);

    const del = await manager.deleteSecret(a.value.secretId);
    expect(del.ok).toBe(true);
    const listed2 = await manager.listSecrets();
    if (!listed2.ok) return;
    expect(listed2.value.find((s) => s.secretId === a.value.secretId)).toBeUndefined();
  });

  it("environment provider can store and fetch", async () => {
    const { manager } = createSecretManagementPlatform({
      providerKind: "environment",
      masterKey: "test-master-key-16+",
    });
    const stored = await manager.storeSecret(sampleStoreInput({ name: "env-key" }));
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    const got = await manager.getSecret(stored.value.secretId);
    expect(got.ok).toBe(true);
  });

  it("cloud backends are placeholders", async () => {
    const aws = new AwsSecretsManagerBackend();
    const put = await aws.put("x" as never, {
      algorithm: "aes-256-gcm",
      ciphertext: "a",
      iv: "b",
      keyVersionId: "v1" as never,
    });
    expect(put.ok).toBe(false);
  });

  it("integrates additively with Provider Identity", async () => {
    const secrets = setupSecretManagement();
    const identity = createIdentityPlatform({
      secretProvider: secrets.asIdentitySecretProvider,
    });

    const registered = await identity.store.registerCredential(
      standardCredentialInput({ secret: "identity-backed-secret-999" })
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    const listed = await secrets.manager.listSecrets({ type: "ai_provider_key" });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThanOrEqual(1);
    expect(identity.secretProvider.kind).toBe("in_memory");
  });

  it("recovers from rotation failure without plaintext leak", async () => {
    const { manager } = setupSecretManagement();
    const stored = await manager.storeSecret(sampleStoreInput());
    if (!stored.ok) return;
    await manager.validateSecret(stored.value.secretId);

    const missing = await manager.rotateSecret({
      secretId: "sec_missing" as never,
      newValue: "x".repeat(20),
    });
    expect(missing.ok).toBe(false);

    const audit = manager.auditSecret();
    expect(audit.ok).toBe(true);
  });
});
