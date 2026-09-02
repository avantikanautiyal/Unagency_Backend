/**
 * Capability Registry port.
 *
 * Purpose: Source of truth for registered capabilities.
 * Responsibilities: register, unregister, replace, validate, resolve, list, version queries.
 * Usage: Injected into Capability Catalog; never executes AI.
 * Future Extension: Persistent adapters, tenant-scoped registries.
 */

import type { CapabilityId } from "../../core/identifiers";
import type { Result } from "../../core/result";
import type { CapabilityDefinition } from "../contracts/capability-definition";
import type {
  CapabilityVersion,
  CapabilityVersionChannel,
} from "../contracts/capability-version";

export interface CapabilityResolveOptions {
  readonly version?: string;
  readonly channel?: CapabilityVersionChannel;
}

export interface ICapabilityRegistry {
  register(capability: CapabilityDefinition): Result<CapabilityDefinition>;
  unregister(id: CapabilityId, version?: string): Result<void>;
  replace(capability: CapabilityDefinition): Result<CapabilityDefinition>;
  validate(capability: CapabilityDefinition): Result<CapabilityDefinition>;
  resolve(
    id: CapabilityId,
    options?: CapabilityResolveOptions
  ): Result<CapabilityDefinition>;
  exists(id: CapabilityId, version?: string): boolean;
  list(): readonly CapabilityDefinition[];
  listVersions(id: CapabilityId): readonly CapabilityDefinition[];
  getVersion(
    id: CapabilityId,
    channel?: CapabilityVersionChannel
  ): Result<CapabilityVersion>;
  clear(): void;
}
