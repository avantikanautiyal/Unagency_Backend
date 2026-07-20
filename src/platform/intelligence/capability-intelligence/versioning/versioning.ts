/**
 * Simple capability versioning helpers.
 */

export function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const [a, b, c] = version.split(".").map((n) => Number(n) || 0);
  return { major: a ?? 0, minor: b ?? 0, patch: c ?? 0 };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

export function bumpPatch(version: string): string {
  const p = parseSemver(version);
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}
