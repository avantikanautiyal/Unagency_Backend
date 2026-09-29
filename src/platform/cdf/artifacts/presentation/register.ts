/**
 * Register Presentation schemas into the M3A ArtifactSchemaRegistry.
 */

import type { CdfArtifactType } from "../types";
import {
  onArtifactSchemaRegistryReset,
  registerArtifactSchema,
} from "../schema-registry";
import {
  PRESENTATION_ARTIFACT_KEYS,
  PRESENTATION_ARTIFACT_TYPE_BY_KEY,
  PRESENTATION_SCHEMA_VERSION,
  presentationSchemaId,
  type PresentationArtifactKey,
} from "./keys";
import { validatePresentationArtifactData } from "./validate";

const KEYS = Object.values(PRESENTATION_ARTIFACT_KEYS) as PresentationArtifactKey[];

export function registerPresentationArtifactSchemas(): void {
  for (const artifactKey of KEYS) {
    const artifactType = PRESENTATION_ARTIFACT_TYPE_BY_KEY[
      artifactKey
    ] as CdfArtifactType;
    registerArtifactSchema({
      artifactType,
      artifactKey,
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      schemaId: presentationSchemaId(artifactKey),
      supportedOperations: ["create", "version", "select", "approve"],
      supportedRepresentations:
        artifactKey === PRESENTATION_ARTIFACT_KEYS.deck
          ? ["preview", "pptx", "pdf"]
          : ["preview"],
      validate: (data) => validatePresentationArtifactData(artifactKey, data),
    });
  }
}

let hooked = false;

export function ensurePresentationSchemasRegistered(): void {
  registerPresentationArtifactSchemas();
  if (!hooked) {
    onArtifactSchemaRegistryReset(() => {
      registerPresentationArtifactSchemas();
    });
    hooked = true;
  }
}

// Auto-register on import (M3B side-effect; safe with M3A reset hooks).
ensurePresentationSchemasRegistered();
