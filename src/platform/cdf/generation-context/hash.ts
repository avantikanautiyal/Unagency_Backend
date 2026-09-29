/**
 * Deterministic generation-context hash (includes exact upstream pins + data fingerprint).
 */

import { fnv1a32 } from "../canonical";
import type { CanonicalGenerationRequest, UpstreamArtifactContext } from "./types";
import type { ResolvedGenerationContext } from "../context-resolver/types";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

function fingerprintData(data: Record<string, unknown>): string {
  return fnv1a32(stableJson(data));
}

export function computeGenerationContextHash(input: {
  currentUserInstruction: string;
  resolved: ResolvedGenerationContext;
  upstream: UpstreamArtifactContext[];
  canonicalFullDeck: boolean;
}): string {
  const parts = [
    input.resolved.contextHash,
    `instr:${input.currentUserInstruction}`,
    `fullDeck:${input.canonicalFullDeck ? "1" : "0"}`,
    ...input.upstream
      .slice()
      .sort((a, b) =>
        `${a.artifactId}@${a.version}`.localeCompare(`${b.artifactId}@${b.version}`),
      )
      .map(
        (u) =>
          `${u.artifactId}|${u.version}|${u.artifactKey}|${u.role}|${u.sessionRole}|${fingerprintData(u.data)}`,
      ),
  ];
  return fnv1a32(parts.join("\n"));
}

export function summarizeUpstreamForObservability(
  upstream: UpstreamArtifactContext[],
): Array<{
  artifactId: string;
  version: number;
  artifactKey: string;
  phaseId: string;
  role: string;
  status: string;
  schemaVersion: string;
  dataBytes: number;
  contentHash: string;
}> {
  return upstream.map((u) => ({
    artifactId: u.artifactId,
    version: u.version,
    artifactKey: u.artifactKey,
    phaseId: u.phaseId,
    role: u.role,
    status: u.status,
    schemaVersion: u.schemaVersion,
    dataBytes: Buffer.byteLength(JSON.stringify(u.data), "utf8"),
    contentHash: fingerprintData(u.data),
  }));
}

export { fingerprintData as fingerprintArtifactDataForObservability };

export type CanonicalGenerationRequestCore = Omit<
  CanonicalGenerationRequest,
  "generationContextHash" | "resolvedContext"
>;
