/**
 * In-memory credential session manager.
 *
 * Purpose: Own the lifecycle of validated, secret-free credential sessions.
 * Responsibilities: acquire/get/renew/release/expire/invalidate.
 * Usage: Injected into the identity engine.
 * Future Extension: Distributed session coordination.
 *
 * Sessions never contain raw secret material — only a CredentialReference.
 */

import type { IClock, IIdGenerator } from "../../../core/interfaces";
import { failure, success, type Result } from "../../../core/result";
import type { CredentialSessionStatus } from "../contracts/enums";
import type {
  CredentialLease,
  CredentialSession,
} from "../contracts/session";
import { CredentialSessionError } from "../errors";
import type {
  AcquireSessionInput,
  ICredentialSessionManager,
} from "../interfaces/session-manager";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export class InMemoryCredentialSessionManager
  implements ICredentialSessionManager
{
  private readonly sessions = new Map<string, CredentialSession>();

  constructor(
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock,
    private readonly defaultTtlMs: number = DEFAULT_TTL_MS
  ) {}

  acquire(input: AcquireSessionInput): Result<CredentialSession> {
    const sessionId = this.idGenerator.generate("csess");
    const leaseId = this.idGenerator.generate("clease");
    const nowMs = this.clock.now().getTime();
    const ttlMs = input.ttlMs ?? this.defaultTtlMs;
    const nowIso = new Date(nowMs).toISOString();
    const expiresAtIso = new Date(nowMs + ttlMs).toISOString();

    const lease: CredentialLease = {
      leaseId,
      sessionId,
      credentialId: input.credentialId,
      acquiredAt: nowIso,
      expiresAt: expiresAtIso,
    };

    const session: CredentialSession = {
      sessionId,
      credentialId: input.credentialId,
      providerId: input.providerId,
      scheme: input.scheme,
      scope: input.scope,
      trustLevel: input.trustLevel,
      grantedPermissions: input.grantedPermissions,
      reference: input.reference,
      authentication: input.authentication,
      authorization: input.authorization,
      validation: input.validation,
      status: "active",
      lease,
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: expiresAtIso,
    };

    this.sessions.set(sessionId, session);
    return success(session);
  }

  get(sessionId: string): Result<CredentialSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return failure(
        new CredentialSessionError("Session not found", { sessionId })
      );
    }
    return success(session);
  }

  renew(sessionId: string, ttlMs?: number): Result<CredentialSession> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return failure(
        new CredentialSessionError("Session not found", { sessionId })
      );
    }
    if (existing.status === "released" || existing.status === "invalidated") {
      return failure(
        new CredentialSessionError("Cannot renew a terminated session", {
          sessionId,
          status: existing.status,
        })
      );
    }
    const nowMs = this.clock.now().getTime();
    const nextTtl = ttlMs ?? this.defaultTtlMs;
    const expiresAtIso = new Date(nowMs + nextTtl).toISOString();
    const renewed: CredentialSession = {
      ...existing,
      status: "renewed",
      updatedAt: new Date(nowMs).toISOString(),
      expiresAt: expiresAtIso,
      lease: { ...existing.lease, expiresAt: expiresAtIso },
    };
    this.sessions.set(sessionId, renewed);
    return success(renewed);
  }

  release(sessionId: string): Result<void> {
    return this.transition(sessionId, "released");
  }

  expire(sessionId: string): Result<void> {
    return this.transition(sessionId, "expired");
  }

  invalidate(sessionId: string): Result<void> {
    return this.transition(sessionId, "invalidated");
  }

  private transition(
    sessionId: string,
    status: CredentialSessionStatus
  ): Result<void> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return failure(
        new CredentialSessionError("Session not found", { sessionId })
      );
    }
    this.sessions.set(sessionId, {
      ...existing,
      status,
      updatedAt: this.clock.nowIso(),
    });
    return success(undefined);
  }
}
