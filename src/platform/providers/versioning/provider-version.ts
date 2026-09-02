/**
 * Provider semantic versioning.
 *
 * Purpose: Version providers and optional model metadata.
 * Responsibilities: Parse, compare, model version records.
 * Usage: ProviderDefinition.version and model version metadata.
 * Future Extension: Pre-release channels.
 */

import { ValidationError } from "../../core/errors";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export class ProviderVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;

  private constructor(major: number, minor: number, patch: number) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  static parse(value: string): ProviderVersion {
    const match = VERSION_PATTERN.exec(value.trim());
    if (!match) {
      throw new ValidationError("Invalid provider version", { value });
    }
    return new ProviderVersion(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );
  }

  static tryParse(value: string): ProviderVersion | undefined {
    try {
      return ProviderVersion.parse(value);
    } catch {
      return undefined;
    }
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  compare(other: ProviderVersion): number {
    if (this.major !== other.major) return this.major - other.major;
    if (this.minor !== other.minor) return this.minor - other.minor;
    return this.patch - other.patch;
  }

  equals(other: ProviderVersion): boolean {
    return this.compare(other) === 0;
  }

  isCompatibleWith(other: ProviderVersion): boolean {
    return this.major === other.major && this.compare(other) >= 0;
  }
}

/**
 * Model version metadata attached to a provider (not an SDK model client).
 */
export interface ProviderModelVersionMetadata {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly deprecated?: boolean;
  readonly retirementAt?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
