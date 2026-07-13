/**
 * Artifact versioning engine — no storage.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ArtifactIdentity,
  ArtifactInput,
  ArtifactVersion,
} from "../contracts/artifact-models";
import type { IArtifactVersionEngine } from "../interfaces/artifact-ports";

export class ArtifactVersionEngine implements IArtifactVersionEngine {
  resolve(input: ArtifactInput, _identity: ArtifactIdentity): Result<ArtifactVersion> {
    const now = new Date().toISOString();
    const version: ArtifactVersion = {
      major: input.version?.major ?? 1,
      minor: input.version?.minor ?? 0,
      patch: input.version?.patch ?? 0,
      revision: input.version?.revision ?? 0,
      label: input.version?.label ?? this.format({
        major: input.version?.major ?? 1,
        minor: input.version?.minor ?? 0,
        patch: input.version?.patch ?? 0,
        revision: input.version?.revision ?? 0,
        state: input.version?.state ?? "draft",
        createdAt: now,
      }),
      state: input.version?.state ?? "draft",
      createdAt: input.version?.createdAt ?? now,
      publishedAt: input.version?.publishedAt,
    };
    return success(version);
  }

  bump(
    current: ArtifactVersion,
    part: "major" | "minor" | "patch" | "revision"
  ): ArtifactVersion {
    const next = { ...current };
    switch (part) {
      case "major":
        next.major += 1;
        next.minor = 0;
        next.patch = 0;
        next.revision = 0;
        break;
      case "minor":
        next.minor += 1;
        next.patch = 0;
        next.revision = 0;
        break;
      case "patch":
        next.patch += 1;
        next.revision = 0;
        break;
      case "revision":
        next.revision += 1;
        break;
    }
    next.label = this.format(next);
    next.createdAt = new Date().toISOString();
    return next;
  }

  format(version: ArtifactVersion): string {
    return `${version.major}.${version.minor}.${version.patch}+${version.revision}`;
  }
}
