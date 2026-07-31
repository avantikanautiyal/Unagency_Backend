export {
  isPlatformOpaqueToken,
  isFirebaseIdTokenCandidate,
} from "./credential-routing";
export {
  mapLegacyRoleToPlatformRoles,
  permissionsForLegacyRole,
  buildLegacyRolePermissionMatrix,
  LEGACY_ROLE_TO_PLATFORM_ROLES,
  type LegacyUserRole,
  type LegacyRoleMappingContext,
} from "./role-permission-mapper";
export {
  LegacyUserIdentityResolver,
  type ResolvedLegacyIdentity,
} from "./legacy-user-identity-resolver";
export {
  FirebaseAuthenticationAdapter,
  isFirebaseAuthenticatedPrincipal,
} from "./firebase-authentication-adapter";
