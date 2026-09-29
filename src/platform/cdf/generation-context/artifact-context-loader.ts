/**
 * Thin ArtifactContext loader — exact version only (never latest/HEAD).
 */

import { getArtifactVersion } from "../artifacts/repository";
import { CdfArtifactError } from "../artifacts/errors";
import type { CdfArtifactVersionRecord } from "../artifacts/types";
import type { CdfSessionArtifactRef } from "../types";
import type { UpstreamArtifactContext, UpstreamArtifactRole } from "./types";

export type LoadExactArtifactInput = {
  artifactId: string;
  version: number;
  organizationId?: string;
  projectId?: string;
};

const versionCacheKey = (id: string, version: number) => `${id}@${version}`;

/**
 * Request-scoped loader: same artifactId@version loads once.
 */
export function createArtifactContextLoader() {
  const cache = new Map<string, CdfArtifactVersionRecord>();

  function loadExact(
    input: LoadExactArtifactInput,
  ): CdfArtifactVersionRecord {
    const key = versionCacheKey(input.artifactId, input.version);
    const hit = cache.get(key);
    if (hit) return hit;
    const record = getArtifactVersion(input.artifactId, input.version, {
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    cache.set(key, record);
    return record;
  }

  return { loadExact, cacheSize: () => cache.size };
}

export type ArtifactContextLoader = ReturnType<typeof createArtifactContextLoader>;

export function mapSessionRoleToUpstreamRole(input: {
  artifactKey: string;
  sessionRole: CdfSessionArtifactRef["role"];
  required: boolean;
}): UpstreamArtifactRole {
  const key = input.artifactKey.toLowerCase();
  if (key.includes("design-system") || key.endsWith(".design-system")) {
    return "design_reference";
  }
  if (key.includes("design-route")) {
    return "selected_reference";
  }
  if (input.sessionRole === "approved") {
    return key.includes("storyline") || key.includes("slide-content")
      ? "approved_content"
      : "source_content";
  }
  if (input.sessionRole === "selected") {
    return "selected_reference";
  }
  if (input.required) return "required_dependency";
  return "data_source";
}

export function toUpstreamArtifactContext(input: {
  record: CdfArtifactVersionRecord;
  phaseId: string;
  sessionRole: CdfSessionArtifactRef["role"];
  required: boolean;
  role?: UpstreamArtifactRole;
}): UpstreamArtifactContext {
  const role =
    input.role ??
    mapSessionRoleToUpstreamRole({
      artifactKey: input.record.artifactKey,
      sessionRole: input.sessionRole,
      required: input.required,
    });
  return {
    artifactId: input.record.artifactId,
    version: input.record.version,
    artifactKey: input.record.artifactKey,
    phaseId: input.phaseId,
    role,
    status: input.record.status,
    schemaVersion: input.record.schemaVersion,
    data: input.record.data,
    lineage: {
      parentArtifactId: input.record.lineage.parentArtifactId,
      parentVersion: input.record.lineage.parentVersion,
      sourceArtifacts: (input.record.lineage.sourceArtifacts ?? []).map((s) => ({
        artifactId: s.artifactId,
        version: s.version,
        artifactKey: s.artifactKey,
        relationship: s.relationship,
      })),
    },
    sessionRole: input.sessionRole,
    required: input.required,
  };
}

export function loadUpstreamFromSessionRef(input: {
  loader: ArtifactContextLoader;
  ref: CdfSessionArtifactRef;
  required: boolean;
  organizationId?: string;
  projectId?: string;
  role?: UpstreamArtifactRole;
}): UpstreamArtifactContext {
  try {
    const record = input.loader.loadExact({
      artifactId: input.ref.artifactId,
      version: input.ref.version,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    return toUpstreamArtifactContext({
      record,
      phaseId: input.ref.phaseId,
      sessionRole: input.ref.role,
      required: input.required,
      role: input.role,
    });
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      throw err;
    }
    throw err;
  }
}
