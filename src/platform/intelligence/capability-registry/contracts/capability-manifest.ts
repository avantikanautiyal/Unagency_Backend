/**
 * Capability manifest contracts.
 *
 * Purpose: Serializable capability pack shape for future loaders.
 * Responsibilities: Describe manifest envelope without parsing implementations.
 * Usage: Future JSON/YAML/DB/marketplace/plugin sources.
 * Future Extension: Manifest signing and checksum verification.
 */

import type { CapabilityDefinition } from "./capability-definition";

/**
 * Serializable capability manifest.
 * Parsing is intentionally not implemented in M1.2.
 */
export interface CapabilityManifest {
  readonly manifestVersion: string;
  readonly name: string;
  readonly description?: string;
  readonly capabilities: readonly CapabilityDefinition[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CapabilityManifestSourceKind =
  | "json"
  | "yaml"
  | "database"
  | "marketplace"
  | "plugin";

export interface CapabilityManifestSourceRef {
  readonly kind: CapabilityManifestSourceKind;
  readonly uri?: string;
  readonly checksum?: string;
}
