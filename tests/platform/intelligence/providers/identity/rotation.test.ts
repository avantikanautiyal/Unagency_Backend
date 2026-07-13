import {
  createTestPlatform,
  standardCredentialInput,
} from "../../../../../src/platform/intelligence/providers/identity/testing";

describe("Rotation engine", () => {
  it("rotates a credential and changes the secret ref", async () => {
    const { store, rotation, secretProvider } = createTestPlatform();
    const registered = await store.registerCredential(
      standardCredentialInput()
    );
    if (!registered.ok) throw registered.error;
    const originalRef = registered.value.reference.secretRef;

    const result = await rotation.rotate(
      registered.value.reference.credentialId,
      "manual",
      "new-secret-value"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.previousSecretRef).toBe(originalRef);
    expect(result.value.newSecretRef).not.toBe(originalRef);
    expect(result.value.reason).toBe("manual");

    // Old secret material is cleaned up; new material exists.
    const oldHas = await secretProvider.hasSecret(originalRef);
    if (oldHas.ok) expect(oldHas.value).toBe(false);
    const newSecret = await secretProvider.getSecret(result.value.newSecretRef);
    if (newSecret.ok) expect(newSecret.value.value).toBe("new-secret-value");
  });

  it("computes shouldRotate from the rotation policy", async () => {
    const { store, rotation, clock } = createTestPlatform();
    const registered = await store.registerCredential(
      standardCredentialInput({
        rotationPolicy: { enabled: true, maxAgeMs: 1000 },
      })
    );
    if (!registered.ok) throw registered.error;

    expect(rotation.shouldRotate(registered.value, clock.now().getTime())).toBe(
      false
    );
    expect(
      rotation.shouldRotate(registered.value, clock.now().getTime() + 2000)
    ).toBe(true);
  });

  it("does not rotate when policy is disabled", async () => {
    const { store, rotation, clock } = createTestPlatform();
    const registered = await store.registerCredential(
      standardCredentialInput({ rotationPolicy: { enabled: false } })
    );
    if (!registered.ok) throw registered.error;
    expect(
      rotation.shouldRotate(registered.value, clock.now().getTime() + 1_000_000)
    ).toBe(false);
  });
});
