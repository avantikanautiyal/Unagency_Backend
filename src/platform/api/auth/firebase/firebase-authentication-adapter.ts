/**
 * Firebase Authentication Adapter — verifies Firebase token and produces AuthPrincipal.
 */

import type { DecodedIdToken } from "firebase-admin/auth";
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdentity,
} from "../../../../libs/firebase/verify-id-token";
import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { AuthPrincipal } from "../../contracts";
import type { ITenantService } from "../../interfaces";
import { LegacyUserIdentityResolver } from "./legacy-user-identity-resolver";
import { mapLegacyRoleToPlatformRoles } from "./role-permission-mapper";
import { provisionFirebaseUser } from "./firebase-user-provisioner";

export interface FirebaseAuthenticationAdapterDeps {
  readonly tenants: ITenantService;
  readonly identityResolver?: LegacyUserIdentityResolver;
  readonly verifyIdToken?: (token: string) => Promise<DecodedIdToken>;
  /**
   * When true (default), first successful Firebase login creates a Mongo customer
   * if none exists. Does not grant organisation membership.
   */
  readonly autoProvisionUser?: boolean;
}

export class FirebaseAuthenticationAdapter {
  private readonly identityResolver: LegacyUserIdentityResolver;
  private readonly autoProvisionUser: boolean;

  constructor(private readonly deps: FirebaseAuthenticationAdapterDeps) {
    this.identityResolver =
      deps.identityResolver ?? new LegacyUserIdentityResolver();
    this.autoProvisionUser = deps.autoProvisionUser !== false;
  }

  async authenticate(token: string): Promise<Result<AuthPrincipal>> {
    if (!token?.trim()) {
      return failure(new ValidationError("token required"));
    }

    let verified: VerifiedFirebaseIdentity;
    try {
      verified = await verifyFirebaseIdToken(token, this.deps.verifyIdToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "firebase token verification failed";
      return failure(new ValidationError(message));
    }

    // The token is verified on every request; only the user / organisation
    // lookup behind it (two database round trips) is reused for a few seconds.
    const recent = recentIdentities.get(verified.uid);
    let identity =
      recent && recent.resolver === this.identityResolver && recent.untilMs > Date.now()
        ? recent.identity
        : await this.identityResolver.resolve(verified);
    if (
      !identity.ok &&
      this.autoProvisionUser &&
      identity.error.message === "user not found"
    ) {
      const provisioned = await provisionFirebaseUser(verified);
      if (!provisioned.ok) {
        return provisioned;
      }
      identity = await this.identityResolver.resolve(verified);
    }
    if (!identity.ok) {
      return identity;
    }

    const resolved = identity.value;
    if (resolved.organizationId && recentIdentities.get(verified.uid)?.identity !== identity) {
      rememberIdentity(verified.uid, this.identityResolver, identity);
    }

    if (resolved.organizationId) {
      const sync = this.deps.tenants.syncOrganizationFromExternal?.({
        organizationId: resolved.organizationId,
        name: resolved.organizationName ?? "Organization",
      });
      if (sync) {
        const synced = await sync;
        if (!synced.ok) {
          return failure(synced.error);
        }
      }
    }

    const roles = mapLegacyRoleToPlatformRoles(
      resolved.legacyRole,
      resolved.roleContext
    );

    const principal: AuthPrincipal = {
      principalId: resolved.userId,
      kind: "user",
      userId: resolved.userId,
      organizationId: resolved.organizationId,
      roles,
      sessionId: `firebase_${resolved.firebaseUid}`,
      expiresAt: verified.expiresAt,
    };

    return success(principal);
  }
}

export function isFirebaseAuthenticatedPrincipal(
  principal: AuthPrincipal | undefined
): boolean {
  return principal?.sessionId?.startsWith("firebase_") === true;
}

const IDENTITY_REUSE_MS = 15_000;
const IDENTITY_REUSE_MAX = 2_000;
const recentIdentities = new Map<
  string,
  { untilMs: number; resolver: object; identity: any }
>();

function rememberIdentity(uid: string, resolver: object, identity: unknown): void {
  recentIdentities.delete(uid);
  recentIdentities.set(uid, { untilMs: Date.now() + IDENTITY_REUSE_MS, resolver, identity });
  if (recentIdentities.size > IDENTITY_REUSE_MAX) {
    const oldest = recentIdentities.keys().next().value;
    if (oldest !== undefined) recentIdentities.delete(oldest);
  }
}
