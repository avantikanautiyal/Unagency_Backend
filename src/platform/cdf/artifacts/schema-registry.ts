/**
 * M3A schema registry — generic builtins + key-specific overlays (M3B).
 *
 * Lookup order:
 *   1. artifactType + artifactKey + schemaVersion  (presentation schemas)
 *   2. artifactType + schemaVersion                (generic fallback)
 */

import type { CdfArtifactType } from "./types";
import { artifactError } from "./errors";

export type CdfArtifactSchemaValidator = (
  data: Record<string, unknown>,
) => { ok: true } | { ok: false; message: string };

export type CdfArtifactSchemaRegistration = {
  artifactType: CdfArtifactType;
  schemaVersion: string;
  /** When set, this schema is keyed for a specific artifact role (M3B). */
  artifactKey?: string;
  /** Stable schema identifier, e.g. unagency.presentation.deck.v1 */
  schemaId?: string;
  validate: CdfArtifactSchemaValidator;
  supportedOperations?: readonly string[];
  supportedRepresentations?: readonly string[];
};

const registry = new Map<string, CdfArtifactSchemaRegistration>();
const postResetHooks: Array<() => void> = [];

function keyOf(
  type: CdfArtifactType,
  version: string,
  artifactKey?: string,
): string {
  return artifactKey
    ? `${type}@${artifactKey}@${version}`
    : `${type}@${version}`;
}

/** M3B (and later) register re-init hooks so reset restores key-specific schemas. */
export function onArtifactSchemaRegistryReset(hook: () => void): void {
  postResetHooks.push(hook);
}

export function resetArtifactSchemaRegistryForTests(): void {
  registry.clear();
  registerBuiltinSchemas();
  for (const hook of postResetHooks) hook();
}

export function registerArtifactSchema(
  schema: CdfArtifactSchemaRegistration,
): void {
  registry.set(
    keyOf(schema.artifactType, schema.schemaVersion, schema.artifactKey),
    schema,
  );
}

export function getArtifactSchema(
  artifactType: CdfArtifactType,
  schemaVersion: string,
  artifactKey?: string,
): CdfArtifactSchemaRegistration | undefined {
  if (artifactKey) {
    const specific = registry.get(
      keyOf(artifactType, schemaVersion, artifactKey),
    );
    if (specific) return specific;
  }
  return registry.get(keyOf(artifactType, schemaVersion));
}

export function listRegisteredArtifactSchemas(): CdfArtifactSchemaRegistration[] {
  return [...registry.values()];
}

export function validateArtifactData(input: {
  artifactType: CdfArtifactType;
  schemaVersion: string;
  data: Record<string, unknown>;
  artifactKey?: string;
}): void {
  const schema = getArtifactSchema(
    input.artifactType,
    input.schemaVersion,
    input.artifactKey,
  );
  if (!schema) {
    throw artifactError(
      "ARTIFACT_SCHEMA_NOT_FOUND",
      `No schema for ${input.artifactType}${input.artifactKey ? `/${input.artifactKey}` : ""}@${input.schemaVersion}`,
      {
        artifactType: input.artifactType,
        schemaVersion: input.schemaVersion,
        artifactKey: input.artifactKey,
      },
    );
  }
  const result = schema.validate(input.data);
  if (!result.ok) {
    throw artifactError("ARTIFACT_SCHEMA_INVALID", result.message, {
      artifactType: input.artifactType,
      schemaVersion: input.schemaVersion,
      artifactKey: input.artifactKey,
      schemaId: schema.schemaId,
    });
  }
}

function requireObject(
  data: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, message: "data must be a plain object" };
  }
  return { ok: true };
}

/** Minimal generic schemas — Presentation overlays register via M3B. */
function registerBuiltinSchemas(): void {
  const types: CdfArtifactType[] = [
    "config_choice",
    "text_choice",
    "text_doc",
    "structured_doc",
    "image",
    "image_set",
    "video",
    "deck",
    "document",
    "email",
    "website",
    "pack",
    "logo",
    "final_bundle",
    "none",
  ];

  for (const artifactType of types) {
    registerArtifactSchema({
      artifactType,
      schemaVersion: "1",
      schemaId: `unagency.cdf.generic.${artifactType}.v1`,
      supportedOperations: ["create", "version", "select", "approve"],
      supportedRepresentations:
        artifactType === "deck"
          ? ["preview", "pptx", "pdf"]
          : artifactType === "image" || artifactType === "logo"
            ? ["preview", "png"]
            : ["preview"],
      validate: (data) => {
        const base = requireObject(data);
        if (!base.ok) return base;
        if (data.executionId != null && data.artifactId != null) {
          if (String(data.executionId) === String(data.artifactId)) {
            return {
              ok: false,
              message: "executionId must not equal artifactId inside data",
            };
          }
        }
        if (
          artifactType === "deck" &&
          data.slides != null &&
          !Array.isArray(data.slides)
        ) {
          return { ok: false, message: "deck.slides must be an array when present" };
        }
        return { ok: true };
      },
    });
  }
}

registerBuiltinSchemas();
