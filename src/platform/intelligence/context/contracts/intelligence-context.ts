/**
 * Intelligence context object model.
 *
 * Purpose: Provider-independent aggregate context for downstream Prompt Compiler.
 * Responsibilities: Hold independently resolved sections and metadata.
 * Usage: Produced by ContextIntelligenceEngine; consumed later by prompt/knowledge modules.
 * Future Extension: Knowledge placeholders (not retrieval).
 */

import type { ContextIdentity, ContextScope, ContextSource } from "./context-identity";
import type { ContextPolicy } from "./context-policy";
import type {
  AssetContextSection,
  BrandContextSection,
  CapabilityContextSection,
  ExecutionContextSection,
  LanguageContextSection,
  LocaleContextSection,
  OrganizationContextSection,
  PlatformContextSection,
  PolicyContextSection,
  ProjectContextSection,
  RequirementContextSection,
  RoleContextSection,
  SecurityContextSection,
  TaskContextSection,
  TimeZoneContextSection,
  UserContextSection,
  WorkspaceContextSection,
} from "./context-sections";

export interface ContextMetadata {
  readonly contextId: string;
  readonly version: string;
  readonly createdAt: string;
  readonly sources: readonly ContextSource[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Runtime execution slice within intelligence context.
 */
export interface ExecutionContext {
  readonly identity: ContextIdentity;
  readonly scope: ContextScope;
  readonly execution: ExecutionContextSection;
  readonly capability: CapabilityContextSection;
}

/**
 * Complete intelligence context — immutable.
 */
export interface IntelligenceContext {
  readonly metadata: ContextMetadata;
  readonly identity: ContextIdentity;
  readonly scope: ContextScope;
  readonly organization: OrganizationContextSection;
  readonly workspace: WorkspaceContextSection;
  readonly project: ProjectContextSection;
  readonly requirement: RequirementContextSection;
  readonly task: TaskContextSection;
  readonly user: UserContextSection;
  readonly role: RoleContextSection;
  readonly capability: CapabilityContextSection;
  readonly execution: ExecutionContextSection;
  readonly brand: BrandContextSection;
  readonly assets: AssetContextSection;
  readonly policy: PolicyContextSection;
  readonly policies: ContextPolicy;
  readonly security: SecurityContextSection;
  readonly language: LanguageContextSection;
  readonly locale: LocaleContextSection;
  readonly timeZone: TimeZoneContextSection;
  readonly platform: PlatformContextSection;
}

/**
 * Immutable snapshot for downstream consumers.
 */
export interface ContextSnapshot {
  readonly snapshotId: string;
  readonly context: IntelligenceContext;
  readonly capturedAt: string;
  readonly checksum?: string;
}

export interface ContextValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly context?: IntelligenceContext;
}
