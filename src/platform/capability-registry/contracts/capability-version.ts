/**
 * Capability semantic version contracts and value object.
 *
 * Purpose: Version capabilities with semver-style major.minor.patch.
 * Responsibilities: Parse, compare, compatibility, channel labels.
 * Usage: CapabilityDefinition.version and registry version queries.
 * Future Extension: Pre-release and build metadata.
 */

import { ValidationError } from "../../core/errors";

export type CapabilityVersionChannel = "latest" | "stable" | "future";

export interface CapabilityVersionParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Immutable semantic version for capabilities.
 */
export class CapabilityVersion implements CapabilityVersionParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;

  private constructor(major: number, minor: number, patch: number) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  static parse(value: string): CapabilityVersion {
    const match = VERSION_PATTERN.exec(value.trim());
    if (!match) {
      throw new ValidationError("Invalid capability version", { value });
    }
    return new CapabilityVersion(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );
  }

  static tryParse(value: string): CapabilityVersion | undefined {
    try {
      return CapabilityVersion.parse(value);
    } catch {
      return undefined;
    }
  }

  static create(major: number, minor: number, patch: number): CapabilityVersion {
    if (
      !Number.isInteger(major) ||
      !Number.isInteger(minor) ||
      !Number.isInteger(patch) ||
      major < 0 ||
      minor < 0 ||
      patch < 0
    ) {
      throw new ValidationError("Invalid capability version parts", {
        major,
        minor,
        patch,
      });
    }
    return new CapabilityVersion(major, minor, patch);
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  equals(other: CapabilityVersion): boolean {
    return (
      this.major === other.major &&
      this.minor === other.minor &&
      this.patch === other.patch
    );
  }

  /**
   * Negative if this < other, 0 if equal, positive if this > other.
   */
  compare(other: CapabilityVersion): number {
    if (this.major !== other.major) {
      return this.major - other.major;
    }
    if (this.minor !== other.minor) {
      return this.minor - other.minor;
    }
    return this.patch - other.patch;
  }

  isCompatibleWith(other: CapabilityVersion): boolean {
    return this.major === other.major && this.compare(other) >= 0;
  }

  isNewerThan(other: CapabilityVersion): boolean {
    return this.compare(other) > 0;
  }

  isDeprecatedRelativeTo(latest: CapabilityVersion): boolean {
    return this.compare(latest) < 0;
  }
}

/**
 * Select version from a list by channel.
 */
export function selectCapabilityVersion(
  versions: readonly CapabilityVersion[],
  channel: CapabilityVersionChannel,
  options?: { readonly stableMajor?: number }
): CapabilityVersion | undefined {
  if (versions.length === 0) {
    return undefined;
  }

  const sorted = [...versions].sort((a, b) => b.compare(a));

  if (channel === "latest" || channel === "future") {
    return sorted[0];
  }

  // stable: highest version on preferred major, else highest overall
  const stableMajor = options?.stableMajor ?? sorted[0]?.major;
  const stableCandidates = sorted.filter((v) => v.major === stableMajor);
  return stableCandidates[0] ?? sorted[0];
}
