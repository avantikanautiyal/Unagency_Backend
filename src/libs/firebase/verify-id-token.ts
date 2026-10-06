/**
 * Shared Firebase ID token verification primitive.
 * Used by legacy VerifyUserHandler and Enterprise API Firebase bridge.
 */

import type { DecodedIdToken } from "firebase-admin/auth";

export interface VerifiedFirebaseIdentity {
  readonly uid: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly expiresAt?: string;
  /** Unix seconds of the actual sign-in; unchanged across token refreshes. */
  readonly authTime?: number;
  /** e.g. password, google.com, apple.com, phone, emailLink */
  readonly signInProvider?: string;
}

export function toVerifiedFirebaseIdentity(
  decoded: DecodedIdToken
): VerifiedFirebaseIdentity {
  return {
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified,
    name: typeof decoded.name === "string" ? decoded.name : undefined,
    phoneNumber:
      typeof decoded.phone_number === "string" ? decoded.phone_number : undefined,
    expiresAt: decoded.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : undefined,
    authTime: typeof decoded.auth_time === "number" ? decoded.auth_time : undefined,
    signInProvider:
      typeof decoded.firebase?.sign_in_provider === "string"
        ? decoded.firebase.sign_in_provider
        : undefined,
  };
}

export async function verifyFirebaseIdToken(
  token: string,
  verifyFn?: (token: string) => Promise<DecodedIdToken>
): Promise<VerifiedFirebaseIdentity> {
  if (!token?.trim()) {
    throw new Error("No Token Provided");
  }
  const verify =
    verifyFn ??
    (async (idToken: string) => {
      const firebaseAdmin = (await import("./index")).default;
      return firebaseAdmin.auth().verifyIdToken(idToken);
    });
  const decoded = await verify(token);
  return toVerifiedFirebaseIdentity(decoded);
}
