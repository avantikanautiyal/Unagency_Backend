/**
 * Composite authentication — platform credentials + Firebase ID token adapter.
 */

import { failure, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type {
  ApiKeyRecord,
  AuthCredential,
  AuthPrincipal,
  IssuedToken,
  RoleName,
} from "../contracts";
import type { IAuthenticationService } from "../interfaces";
import { InMemoryAuthenticationService } from "../authentication/in-memory-authentication-service";
import { FirebaseAuthenticationAdapter } from "./firebase/firebase-authentication-adapter";
import {
  isFirebaseIdTokenCandidate,
  isPlatformOpaqueToken,
} from "./firebase/credential-routing";

export class CompositeAuthenticationService implements IAuthenticationService {
  private firebaseAdapter?: FirebaseAuthenticationAdapter;

  constructor(private readonly platform: InMemoryAuthenticationService) {}

  get platformAuth(): InMemoryAuthenticationService {
    return this.platform;
  }

  setFirebaseAdapter(adapter: FirebaseAuthenticationAdapter): void {
    this.firebaseAdapter = adapter;
  }

  seedUser(input: {
    email: string;
    password: string;
    userId: string;
    organizationId: string;
    roles: RoleName[];
  }): void {
    this.platform.seedUser(input);
  }

  async login(input: {
    email: string;
    password: string;
    organizationId: string;
    deviceId: string;
    scheme?: AuthCredential["scheme"];
  }): Promise<Result<IssuedToken>> {
    return this.platform.login(input);
  }

  async authenticate(credential: AuthCredential): Promise<Result<AuthPrincipal>> {
    if (!credential.token?.trim()) {
      return failure(new ValidationError("token required"));
    }

    if (credential.scheme === "api_key") {
      return this.platform.authenticate(credential);
    }

    if (isPlatformOpaqueToken(credential.token)) {
      return this.platform.authenticate(credential);
    }

    if (this.firebaseAdapter && isFirebaseIdTokenCandidate(credential.token)) {
      return this.firebaseAdapter.authenticate(credential.token);
    }

    return this.platform.authenticate(credential);
  }

  async issueApiKey(input: {
    organizationId: string;
    name: string;
    roles: RoleName[];
  }): Promise<Result<{ apiKey: string; record: ApiKeyRecord }>> {
    return this.platform.issueApiKey(input);
  }

  revokeSession(sessionId: string): Result<void> {
    return this.platform.revokeSession(sessionId);
  }
}

export function createCompositeAuthenticationService(input: {
  nowIso: () => string;
  createId: (prefix: string) => string;
  clockMs: () => number;
}): CompositeAuthenticationService {
  return new CompositeAuthenticationService(
    new InMemoryAuthenticationService(input.nowIso, input.createId, input.clockMs)
  );
}

export function unwrapPlatformAuth(
  auth: IAuthenticationService
): InMemoryAuthenticationService | undefined {
  if (auth instanceof CompositeAuthenticationService) {
    return auth.platformAuth;
  }
  if (auth instanceof InMemoryAuthenticationService) {
    return auth;
  }
  return undefined;
}
