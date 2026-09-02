/**
 * SDK version contract.
 *
 * Purpose: Describe a wrapper/SDK version without vendor package types.
 * Responsibilities: Semantic version + raw string.
 * Usage: Part of SdkClientDescriptor.
 * Future Extension: Build metadata, commit hash.
 */

export interface SdkVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly raw: string;
}

export function parseSdkVersion(raw: string): SdkVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!match) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw,
  };
}
