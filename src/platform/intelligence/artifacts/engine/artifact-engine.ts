/**
 * Intelligence Artifact Engine.
 *
 * Purpose: Canonical immutable intelligence objects for the platform.
 * Responsibilities: Identity → metadata → version → lineage → provenance → signature → validation → snapshot.
 * Usage: create(ArtifactInput) → ArtifactResult
 * Future Extension: External persistence adapters consume snapshots.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  Artifact,
  ArtifactInput,
  ArtifactResult,
  ArtifactSnapshot,
} from "../contracts/artifact-models";
import { ArtifactValidationError } from "../errors";
import type {
  IArtifactEngine,
  IArtifactIdentityBuilder,
  IArtifactLineageEngine,
  IArtifactManifestBuilder,
  IArtifactMetadataBuilder,
  IArtifactProvenanceEngine,
  IArtifactRegistry,
  IArtifactSignatureEngine,
  IArtifactSnapshotBuilder,
  IArtifactValidator,
  IArtifactVersionEngine,
} from "../interfaces/artifact-ports";
import { resolveArtifactSerializer } from "../serialization/artifact-serializer";
import { ArtifactLifecycleManager } from "../lifecycle/artifact-lifecycle";

export interface ArtifactEngineDependencies {
  readonly registry: IArtifactRegistry;
  readonly identityBuilder: IArtifactIdentityBuilder;
  readonly metadataBuilder: IArtifactMetadataBuilder;
  readonly versionEngine: IArtifactVersionEngine;
  readonly lineageEngine: IArtifactLineageEngine;
  readonly provenanceEngine: IArtifactProvenanceEngine;
  readonly signatureEngine: IArtifactSignatureEngine;
  readonly validator: IArtifactValidator;
  readonly manifestBuilder: IArtifactManifestBuilder;
  readonly snapshotBuilder: IArtifactSnapshotBuilder;
  readonly lifecycleManager?: ArtifactLifecycleManager;
}

export class ArtifactEngine implements IArtifactEngine {
  private readonly lifecycleManager: ArtifactLifecycleManager;

  constructor(private readonly deps: ArtifactEngineDependencies) {
    this.lifecycleManager = deps.lifecycleManager ?? new ArtifactLifecycleManager();
  }

  async create<TPayload = Readonly<Record<string, unknown>>>(
    input: ArtifactInput<TPayload>
  ): Promise<Result<ArtifactResult<TPayload>>> {
    const descriptor = this.deps.registry.resolve(input.type);
    if (!descriptor.ok) {
      return descriptor;
    }

    const identity = this.deps.identityBuilder.build(input);
    if (!identity.ok) return identity;

    const metadata = this.deps.metadataBuilder.build(input, identity.value);
    if (!metadata.ok) return metadata;

    const version = this.deps.versionEngine.resolve(input, identity.value);
    if (!version.ok) return version;

    const lineage = this.deps.lineageEngine.build(input, identity.value);
    if (!lineage.ok) return lineage;

    const provenance = this.deps.provenanceEngine.build(
      input,
      identity.value,
      lineage.value
    );
    if (!provenance.ok) return provenance;

    const unsigned: Omit<Artifact<TPayload>, "signature"> = {
      identity: identity.value,
      type: input.type,
      version: version.value,
      metadata: metadata.value,
      lineage: lineage.value,
      provenance: provenance.value,
      lifecycle: input.lifecycle ?? "created",
      relationships: input.relationships ?? [],
      payload: input.payload,
    };

    const structuralValidation = this.deps.validator.validate({
      ...unsigned,
      signature: {
        algorithm: "canonical_sha256",
        checksum: "pending",
        signedAt: new Date().toISOString(),
      },
    });
    if (!structuralValidation.ok) return structuralValidation;

    if (!structuralValidation.value.valid) {
      return failure(
        new ArtifactValidationError("Artifact validation failed", {
          issues: structuralValidation.value.issues,
        })
      );
    }

    const validatedTransition = this.lifecycleManager.transition(
      {
        ...unsigned,
        signature: {
          algorithm: "canonical_sha256",
          checksum: "pending",
          signedAt: new Date().toISOString(),
        },
      },
      "validated"
    );
    if (!validatedTransition.ok) return validatedTransition;

    const signable: Omit<Artifact<TPayload>, "signature"> = {
      identity: validatedTransition.value.identity,
      type: validatedTransition.value.type,
      version: validatedTransition.value.version,
      metadata: validatedTransition.value.metadata,
      lineage: validatedTransition.value.lineage,
      provenance: validatedTransition.value.provenance,
      lifecycle: validatedTransition.value.lifecycle,
      relationships: validatedTransition.value.relationships,
      payload: validatedTransition.value.payload,
    };

    const signature = this.deps.signatureEngine.sign(signable);
    if (!signature.ok) return signature;

    const artifact: Artifact<TPayload> = {
      ...signable,
      signature: signature.value,
    };

    const validation = this.deps.validator.validate(artifact);
    if (!validation.ok) return validation;

    const manifest = this.deps.manifestBuilder.build(artifact);
    const snapshot = this.deps.snapshotBuilder.build(artifact, manifest);

    return success({
      artifact,
      snapshot,
      validation: validation.value,
    });
  }

  snapshot(artifact: Artifact): Result<ArtifactSnapshot> {
    const manifest = this.deps.manifestBuilder.build(artifact);
    return success(this.deps.snapshotBuilder.build(artifact, manifest));
  }

  serialize(
    artifact: Artifact,
    format: "json" | "canonical_json" = "json"
  ): Result<string> {
    return resolveArtifactSerializer(format).serialize(artifact);
  }
}
