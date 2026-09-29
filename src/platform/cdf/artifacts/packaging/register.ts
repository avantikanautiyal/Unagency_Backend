/**
 * Register Packaging schemas into the M3A ArtifactSchemaRegistry (M8A).
 */

import type { CdfArtifactType } from "../types";
import {
  onArtifactSchemaRegistryReset,
  registerArtifactSchema,
} from "../schema-registry";
import {
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_ARTIFACT_TYPE_BY_KEY,
  PACKAGING_SCHEMA_VERSION,
  packagingSchemaId,
  type PackagingArtifactKey,
} from "./keys";
import { validatePackagingArtifactData } from "./validate";

const KEYS = Object.values(PACKAGING_ARTIFACT_KEYS) as PackagingArtifactKey[];

export function registerPackagingArtifactSchemas(): void {
  for (const artifactKey of KEYS) {
    const artifactType = PACKAGING_ARTIFACT_TYPE_BY_KEY[
      artifactKey
    ] as CdfArtifactType;
    registerArtifactSchema({
      artifactType,
      artifactKey,
      schemaVersion: PACKAGING_SCHEMA_VERSION,
      schemaId: packagingSchemaId(artifactKey),
      supportedOperations: [
        "create",
        "version",
        "select",
        "approve",
        "refine",
      ],
      supportedRepresentations: ["preview", "png", "pdf", "svg"],
      validate: (data) => validatePackagingArtifactData(artifactKey, data),
    });
  }
}

let hooked = false;

export function ensurePackagingSchemasRegistered(): void {
  registerPackagingArtifactSchemas();
  if (!hooked) {
    onArtifactSchemaRegistryReset(() => {
      registerPackagingArtifactSchemas();
    });
    hooked = true;
  }
}

ensurePackagingSchemasRegistered();
