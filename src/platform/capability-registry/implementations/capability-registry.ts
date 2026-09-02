/**
 * In-memory capability registry.
 *
 * Purpose: Source of truth for capability definitions.
 * Responsibilities: register, unregister, replace, validate, resolve, list, versions.
 * Usage: Constructed by callers/factories; injected into CapabilityCatalog.
 * Future Extension: Persistent adapters.
 */

import type { CapabilityId } from "../../core/identifiers";
import { failure, success } from "../../core/result";
import type { Result } from "../../core/result";
import type { CapabilityDefinition } from "../contracts/capability-definition";
import { canTransitionCapabilityStatus } from "../contracts/capability-status";
import {
  CapabilityVersion,
  selectCapabilityVersion,
  type CapabilityVersionChannel,
} from "../contracts/capability-version";
import {
  CapabilityNotFoundError,
  CapabilityRegistryError,
} from "../errors";
import type {
  CapabilityResolveOptions,
  ICapabilityRegistry,
} from "../interfaces/capability-registry";
import type { ICapabilityValidator } from "../interfaces/capability-validator";
import { CapabilityValidator } from "./capability-validator";

function keyOf(id: CapabilityId | string, version: string): string {
  return `${String(id)}@${version}`;
}

export class CapabilityRegistry implements ICapabilityRegistry {
  private readonly items = new Map<string, CapabilityDefinition>();

  constructor(
    private readonly validator: ICapabilityValidator = new CapabilityValidator()
  ) {}

  register(capability: CapabilityDefinition): Result<CapabilityDefinition> {
    const validated = this.validator.validate(capability);
    if (!validated.ok) {
      return validated;
    }

    const key = keyOf(capability.id, capability.version);
    if (this.items.has(key)) {
      return failure(
        new CapabilityRegistryError("Capability version already registered", {
          id: capability.id,
          version: capability.version,
        })
      );
    }

    this.items.set(key, validated.value);
    return success(validated.value);
  }

  unregister(id: CapabilityId, version?: string): Result<void> {
    if (version) {
      const key = keyOf(id, version);
      if (!this.items.has(key)) {
        return failure(
          new CapabilityNotFoundError("Capability version not found", {
            id,
            version,
          })
        );
      }
      this.items.delete(key);
      return success(undefined);
    }

    const versions = this.listVersions(id);
    if (versions.length === 0) {
      return failure(
        new CapabilityNotFoundError("Capability not found", { id })
      );
    }
    for (const entry of versions) {
      this.items.delete(keyOf(entry.id, entry.version));
    }
    return success(undefined);
  }

  replace(capability: CapabilityDefinition): Result<CapabilityDefinition> {
    const validated = this.validator.validate(capability);
    if (!validated.ok) {
      return validated;
    }

    const key = keyOf(capability.id, capability.version);
    const existing = this.items.get(key);
    if (existing) {
      if (
        !canTransitionCapabilityStatus(existing.status, capability.status)
      ) {
        return failure(
          new CapabilityRegistryError("Invalid capability status transition", {
            id: capability.id,
            from: existing.status,
            to: capability.status,
          })
        );
      }
    }

    const replaced: CapabilityDefinition = {
      ...validated.value,
      createdAt: existing?.createdAt ?? validated.value.createdAt,
      updatedAt: validated.value.updatedAt,
    };
    this.items.set(key, replaced);
    return success(replaced);
  }

  validate(capability: CapabilityDefinition): Result<CapabilityDefinition> {
    return this.validator.validate(capability);
  }

  resolve(
    id: CapabilityId,
    options?: CapabilityResolveOptions
  ): Result<CapabilityDefinition> {
    if (options?.version) {
      const found = this.items.get(keyOf(id, options.version));
      if (!found) {
        return failure(
          new CapabilityNotFoundError("Capability version not found", {
            id,
            version: options.version,
          })
        );
      }
      return success(found);
    }

    const versions = this.listVersions(id);
    if (versions.length === 0) {
      return failure(
        new CapabilityNotFoundError("Capability not found", { id })
      );
    }

    const parsed = versions
      .map((entry) => ({
        entry,
        version: CapabilityVersion.parse(entry.version),
      }))
      .sort((a, b) => b.version.compare(a.version));

    const channel = options?.channel ?? "latest";
    const selectedVersion = selectCapabilityVersion(
      parsed.map((p) => p.version),
      channel
    );
    const selected = parsed.find((p) =>
      selectedVersion ? p.version.equals(selectedVersion) : false
    );

    if (!selected) {
      return failure(
        new CapabilityNotFoundError("Capability version not found", { id })
      );
    }
    return success(selected.entry);
  }

  exists(id: CapabilityId, version?: string): boolean {
    if (version) {
      return this.items.has(keyOf(id, version));
    }
    return this.listVersions(id).length > 0;
  }

  list(): readonly CapabilityDefinition[] {
    return Array.from(this.items.values());
  }

  listVersions(id: CapabilityId): readonly CapabilityDefinition[] {
    const idStr = String(id);
    return this.list().filter((entry) => String(entry.id) === idStr);
  }

  getVersion(
    id: CapabilityId,
    channel: CapabilityVersionChannel = "latest"
  ): Result<CapabilityVersion> {
    const versions = this.listVersions(id).map((entry) =>
      CapabilityVersion.parse(entry.version)
    );
    const selected = selectCapabilityVersion(versions, channel);
    if (!selected) {
      return failure(
        new CapabilityNotFoundError("Capability not found", { id })
      );
    }
    return success(selected);
  }

  clear(): void {
    this.items.clear();
  }
}
