import { InMemoryCredentialSessionManager } from "../../../../../src/platform/intelligence/providers/identity/sessions/session-manager";
import {
  FixedClock,
  SequentialIdGenerator,
} from "../../../../../src/platform/intelligence/providers/identity/testing";
import { asCredentialId } from "../../../../../src/platform/intelligence/providers/identity/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";
import type { AcquireSessionInput } from "../../../../../src/platform/intelligence/providers/identity/interfaces/session-manager";

function acquireInput(): AcquireSessionInput {
  const credentialId = asCredentialId("cred-1");
  const providerId = asProviderId("provider-1");
  return {
    credentialId,
    providerId,
    scheme: "api_key",
    scope: { providerId },
    trustLevel: "high",
    grantedPermissions: ["read", "execute"],
    reference: {
      credentialId,
      providerId,
      scheme: "api_key",
      secretRef: "sref-1",
    },
    authentication: {
      authenticated: true,
      scheme: "api_key",
      credentialId,
      providerId,
      reasons: [],
    },
    authorization: {
      authorized: true,
      providerId,
      scope: { providerId },
      grantedPermissions: ["read", "execute"],
      deniedPermissions: [],
      reasons: [],
    },
    validation: {
      valid: true,
      credentialId,
      checks: [],
      validatedAt: new Date(0).toISOString(),
    },
  };
}

describe("InMemoryCredentialSessionManager", () => {
  function manager() {
    return new InMemoryCredentialSessionManager(
      new SequentialIdGenerator(),
      new FixedClock(0),
      60_000
    );
  }

  it("acquires an active session with a lease", () => {
    const m = manager();
    const result = m.acquire(acquireInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("active");
    expect(result.value.expiresAt).toBeDefined();
  });

  it("renews a session and extends the lease", () => {
    const m = manager();
    const acquired = m.acquire(acquireInput());
    if (!acquired.ok) throw acquired.error;
    const renewed = m.renew(acquired.value.sessionId, 120_000);
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.value.status).toBe("renewed");
  });

  it("expires and invalidates sessions", () => {
    const m = manager();
    const a = m.acquire(acquireInput());
    if (!a.ok) throw a.error;
    expect(m.expire(a.value.sessionId).ok).toBe(true);
    const afterExpire = m.get(a.value.sessionId);
    if (!afterExpire.ok) return;
    expect(afterExpire.value.status).toBe("expired");

    const b = m.acquire(acquireInput());
    if (!b.ok) throw b.error;
    expect(m.invalidate(b.value.sessionId).ok).toBe(true);
    const afterInvalidate = m.get(b.value.sessionId);
    if (!afterInvalidate.ok) return;
    expect(afterInvalidate.value.status).toBe("invalidated");
  });

  it("refuses to renew a released session", () => {
    const m = manager();
    const a = m.acquire(acquireInput());
    if (!a.ok) throw a.error;
    m.release(a.value.sessionId);
    const renewed = m.renew(a.value.sessionId);
    expect(renewed.ok).toBe(false);
  });
});
