/**
 * Credential type detection for composite authentication routing.
 */

export function isPlatformOpaqueToken(token: string): boolean {
  return (
    token.startsWith("jwt_") ||
    token.startsWith("oauth_") ||
    token.startsWith("session_") ||
    token.startsWith("service_") ||
    token.startsWith("refresh_")
  );
}

/** Firebase ID tokens are JWT-shaped but are not platform opaque tokens. */
export function isFirebaseIdTokenCandidate(token: string): boolean {
  if (isPlatformOpaqueToken(token)) return false;
  return token.startsWith("eyJ") && token.split(".").length === 3;
}
