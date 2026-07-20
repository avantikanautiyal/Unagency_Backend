/**
 * In-memory authentication — JWT/session/API key/service account abstractions.
 * No external IdP SDK in this milestone.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type {
  ApiKeyRecord,
  AuthCredential,
  AuthPrincipal,
  AuthSession,
  IssuedToken,
  RoleName,
} from "../contracts";
import type { IAuthenticationService } from "../interfaces";
import { permissionsForRoles } from "../authorization/rbac";

export class InMemoryAuthenticationService implements IAuthenticationService {
  private readonly sessions = new Map<string, AuthSession>();
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly users = new Map<
    string,
    { email: string; password: string; userId: string; organizationId: string; roles: RoleName[] }
  >();
  private readonly tokens = new Map<string, AuthPrincipal>();

  constructor(
    private readonly nowIso: () => string,
    private readonly createId: (prefix: string) => string,
    private readonly clockMs: () => number
  ) {}

  seedUser(input: {
    email: string;
    password: string;
    userId: string;
    organizationId: string;
    roles: RoleName[];
  }): void {
    this.users.set(input.email, input);
  }

  async login(input: {
    email: string;
    password: string;
    organizationId: string;
    deviceId: string;
    scheme?: AuthCredential["scheme"];
  }): Promise<Result<IssuedToken>> {
    const user = this.users.get(input.email);
    if (!user || user.password !== input.password) {
      return failure(new ValidationError("invalid credentials"));
    }
    if (user.organizationId !== input.organizationId) {
      return failure(new ValidationError("organization mismatch"));
    }
    const scheme = input.scheme ?? "jwt";
    const sessionId = this.createId("ses");
    const expiresAt = new Date(this.clockMs() + 3600_000).toISOString();
    const session: AuthSession = {
      sessionId,
      userId: user.userId,
      organizationId: user.organizationId,
      deviceId: input.deviceId,
      scheme,
      issuedAt: this.nowIso(),
      expiresAt,
      revoked: false,
    };
    this.sessions.set(sessionId, session);

    const accessToken = `${scheme}_${this.createId("tok")}`;
    const principal: AuthPrincipal = {
      principalId: user.userId,
      kind: "user",
      userId: user.userId,
      organizationId: user.organizationId,
      roles: user.roles,
      sessionId,
      deviceId: input.deviceId,
      expiresAt,
    };
    this.tokens.set(accessToken, principal);

    return success({
      accessToken,
      refreshToken: `refresh_${this.createId("rt")}`,
      tokenType: "Bearer",
      expiresInSec: 3600,
      scheme,
      sessionId,
    });
  }

  async authenticate(credential: AuthCredential): Promise<Result<AuthPrincipal>> {
    if (!credential.token?.trim()) {
      return failure(new ValidationError("token required"));
    }

    if (credential.scheme === "api_key") {
      const key = [...this.apiKeys.values()].find(
        (k) => !k.revoked && credential.token.startsWith(k.prefix) && hash(credential.token) === k.hashedKey
      );
      if (!key) return failure(new ValidationError("invalid api key"));
      return success({
        principalId: key.apiKeyId,
        kind: "api_key",
        organizationId: key.organizationId,
        roles: key.roles,
        apiKeyId: key.apiKeyId,
      });
    }

    if (credential.scheme === "service_account") {
      const principal = this.tokens.get(credential.token);
      if (!principal || principal.kind !== "service") {
        // accept opaque service tokens minted as service_*
        if (credential.token.startsWith("service_")) {
          return success({
            principalId: credential.token,
            kind: "service",
            organizationId: credential.token.split(":")[1] ?? "org_service",
            roles: ["service"],
            serviceAccountId: credential.token,
          });
        }
        return failure(new ValidationError("invalid service account token"));
      }
      return success(principal);
    }

    const principal = this.tokens.get(credential.token);
    if (!principal) return failure(new ValidationError("invalid or expired token"));
    if (principal.sessionId) {
      const session = this.sessions.get(principal.sessionId);
      if (!session || session.revoked) {
        return failure(new ValidationError("session revoked"));
      }
    }
    return success(principal);
  }

  async issueApiKey(input: {
    organizationId: string;
    name: string;
    roles: RoleName[];
  }): Promise<Result<{ apiKey: string; record: ApiKeyRecord }>> {
    const apiKeyId = this.createId("ak");
    const prefix = `uag_${apiKeyId.slice(0, 8)}_`;
    const secret = `${prefix}${this.createId("secret")}`;
    const record: ApiKeyRecord = {
      apiKeyId,
      organizationId: input.organizationId,
      name: input.name,
      hashedKey: hash(secret),
      prefix,
      roles: input.roles,
      createdAt: this.nowIso(),
      revoked: false,
    };
    this.apiKeys.set(apiKeyId, record);
    return success({ apiKey: secret, record });
  }

  revokeSession(sessionId: string): Result<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return failure(new ValidationError("session not found"));
    this.sessions.set(sessionId, { ...session, revoked: true });
    return success(undefined);
  }

  /** Test helper */
  listSessionsForUser(userId: string): AuthSession[] {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  permissionsPreview(roles: RoleName[]) {
    return permissionsForRoles(roles);
  }
}

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 33 + value.charCodeAt(i)) | 0;
  return `h${Math.abs(h).toString(16)}`;
}
