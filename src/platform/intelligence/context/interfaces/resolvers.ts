/**
 * Context resolvers — determine what information is available, not how it is retrieved.
 * Placeholder implementations only (no DB/HTTP).
 */

import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";

export interface ResolvedContextFacts {
  readonly available: boolean;
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface IContextResolver {
  readonly kind: string;
  resolve(request: ContextBuildRequest): Promise<Result<ResolvedContextFacts>>;
}

export interface IOrganizationContextResolver extends IContextResolver {
  readonly kind: "organization";
}

export interface IWorkspaceContextResolver extends IContextResolver {
  readonly kind: "workspace";
}

export interface IUserContextResolver extends IContextResolver {
  readonly kind: "user";
}

export interface IBrandContextResolver extends IContextResolver {
  readonly kind: "brand";
}

export interface IAssetContextResolver extends IContextResolver {
  readonly kind: "asset";
}

export interface ICapabilityContextResolver extends IContextResolver {
  readonly kind: "capability";
}
