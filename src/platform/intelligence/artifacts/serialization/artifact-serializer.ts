/**
 * Artifact serializers — JSON and canonical JSON.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { Artifact } from "../contracts/artifact-models";
import { ArtifactValidationError } from "../errors";
import { canonicalizeForSigning } from "../signatures/signature-engine";
import type { IArtifactSerializer } from "../interfaces/artifact-ports";

export class JsonArtifactSerializer implements IArtifactSerializer {
  readonly format = "json" as const;

  serialize(artifact: Artifact): Result<string> {
    try {
      return success(JSON.stringify(artifact, null, 2));
    } catch (error) {
      return failure(
        new ArtifactValidationError("Failed to serialize artifact", { cause: String(error) })
      );
    }
  }

  deserialize<TPayload = Readonly<Record<string, unknown>>>(
    payload: string
  ): Result<Artifact<TPayload>> {
    try {
      const parsed = JSON.parse(payload) as Artifact<TPayload>;
      return success(parsed);
    } catch (error) {
      return failure(
        new ArtifactValidationError("Failed to deserialize artifact", { cause: String(error) })
      );
    }
  }
}

export class CanonicalJsonArtifactSerializer implements IArtifactSerializer {
  readonly format = "canonical_json" as const;

  serialize(artifact: Artifact): Result<string> {
    try {
      return success(canonicalizeForSigning(artifact));
    } catch (error) {
      return failure(
        new ArtifactValidationError("Failed to canonicalize artifact", {
          cause: String(error),
        })
      );
    }
  }

  deserialize<TPayload = Readonly<Record<string, unknown>>>(
    payload: string
  ): Result<Artifact<TPayload>> {
    return new JsonArtifactSerializer().deserialize<TPayload>(payload);
  }
}

export function resolveArtifactSerializer(
  format: "json" | "canonical_json" = "json"
): IArtifactSerializer {
  return format === "canonical_json"
    ? new CanonicalJsonArtifactSerializer()
    : new JsonArtifactSerializer();
}
