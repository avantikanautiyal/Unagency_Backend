/**
 * Independently resolvable context sections.
 * Provider-independent; no LLM-specific fields.
 */

export interface OrganizationContextSection {
  readonly organizationId: string;
  readonly name?: string;
  readonly planTier?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface WorkspaceContextSection {
  readonly workspaceId: string;
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ProjectContextSection {
  readonly projectId?: string;
  readonly name?: string;
  readonly status?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RequirementContextSection {
  readonly requirementId?: string;
  readonly title?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface TaskContextSection {
  readonly taskId?: string;
  readonly title?: string;
  readonly status?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface UserContextSection {
  readonly userId?: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RoleContextSection {
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface CapabilityContextSection {
  readonly capabilityId: string;
  readonly capabilityVersion?: string;
  readonly name?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly status?: string;
}

export interface ExecutionContextSection {
  readonly priority?: string;
  readonly inputHints?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface BrandContextSection {
  readonly brandId?: string;
  readonly voice?: string;
  readonly tone?: string;
  readonly guidelines?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface AssetContextSection {
  readonly assetIds: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface PolicyContextSection {
  readonly brandPolicyId?: string;
  readonly securityPolicyId?: string;
  readonly executionPolicyId?: string;
  readonly privacyPolicyId?: string;
  readonly compliancePolicyId?: string;
  readonly localizationPolicyId?: string;
  readonly references?: Readonly<Record<string, string>>;
}

export interface SecurityContextSection {
  readonly classification?: string;
  readonly requiredPermissions: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface LanguageContextSection {
  readonly language: string;
  readonly fallbackLanguage?: string;
}

export interface LocaleContextSection {
  readonly locale: string;
  readonly currency?: string;
}

export interface TimeZoneContextSection {
  readonly timeZone: string;
}

export interface PlatformContextSection {
  readonly platformName: string;
  readonly platformVersion: string;
  readonly environment?: string;
}
