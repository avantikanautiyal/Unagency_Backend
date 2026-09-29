/**
 * Phase 16 — Artifact schema QA via existing validateArtifactData / domain validators.
 */

import { validateArtifactData } from "../../../cdf/artifacts/schema-registry";
import { validatePresentationArtifactData } from "../../../cdf/artifacts/presentation/validate";
import { PRESENTATION_ARTIFACT_KEYS } from "../../../cdf/artifacts/presentation/keys";
import { validatePackagingArtifactData } from "../../../cdf/artifacts/packaging/validate";
import { validateSocialMediaArtifactData } from "../../../cdf/artifacts/social-media/validate";
import type { CdfArtifactType } from "../../../cdf/artifacts/types";
import type {
  OutputQACheckId,
  OutputQAContext,
  OutputQADiagnostic,
  OutputQAProvidedArtifact,
} from "../types";

const PRESENTATION_KEYS = new Set<string>(Object.values(PRESENTATION_ARTIFACT_KEYS));

export type ArtifactQAPartial = {
  readonly diagnostics: OutputQADiagnostic[];
  readonly checks: OutputQACheckId[];
  readonly metadata: Record<string, unknown>;
};

function isPresentationKey(key: string): key is (typeof PRESENTATION_ARTIFACT_KEYS)[keyof typeof PRESENTATION_ARTIFACT_KEYS] {
  return PRESENTATION_KEYS.has(key);
}

export function validateProvidedArtifactSchema(
  artifact: OutputQAProvidedArtifact,
  context: OutputQAContext = {},
): ArtifactQAPartial {
  const diagnostics: OutputQADiagnostic[] = [];
  const checks: OutputQACheckId[] = ["artifact_identity", "artifact_version"];
  const metadata: Record<string, unknown> = {
    artifactId: artifact.artifactId,
    artifactVersion: artifact.version,
    artifactKey: artifact.artifactKey,
  };

  if (!artifact.artifactId || !String(artifact.artifactId).startsWith("cdfart_")) {
    diagnostics.push({
      code: "ARTIFACT_IDENTITY_MISMATCH",
      severity: "error",
      message: "artifactId must be a cdfart_* identity",
      fieldPath: "artifactId",
      authoritativeSource: "cdf/artifacts/ids",
    });
  }

  if (typeof artifact.version !== "number" || artifact.version < 1) {
    diagnostics.push({
      code: "ARTIFACT_VERSION_INVALID",
      severity: "error",
      message: "artifact version must be a positive integer",
      fieldPath: "version",
      authoritativeSource: "cdf/artifacts/types",
    });
  }

  if (
    context.expectedArtifactId &&
    artifact.artifactId !== context.expectedArtifactId
  ) {
    diagnostics.push({
      code: "ARTIFACT_IDENTITY_MISMATCH",
      severity: "error",
      message: "artifact identity does not match expected pin",
      fieldPath: "artifactId",
      authoritativeSource: "OutputQAContext.expectedArtifactId",
    });
  }

  if (
    context.expectedArtifactVersion != null &&
    artifact.version !== context.expectedArtifactVersion
  ) {
    diagnostics.push({
      code: "ARTIFACT_VERSION_INVALID",
      severity: "error",
      message: "artifact version does not match expected exact version",
      fieldPath: "version",
      authoritativeSource: "OutputQAContext.expectedArtifactVersion",
    });
  }

  if (
    context.expectedServiceId &&
    artifact.serviceId &&
    artifact.serviceId !== context.expectedServiceId
  ) {
    checks.push("service_identity");
    diagnostics.push({
      code: "SERVICE_MISMATCH",
      severity: "error",
      message: "artifact serviceId mismatch",
      fieldPath: "serviceId",
      authoritativeSource: "ActionDefinition / CDF service",
    });
  }

  if (
    context.expectedPhaseId &&
    artifact.phaseId &&
    artifact.phaseId !== context.expectedPhaseId
  ) {
    checks.push("phase_identity");
    diagnostics.push({
      code: "PHASE_MISMATCH",
      severity: "error",
      message: "artifact phaseId mismatch",
      fieldPath: "phaseId",
      authoritativeSource: "CDF phase registry",
    });
  }

  if (artifact.fromArtifactVersion === false) {
    checks.push("approval_note_non_authoritative");
    diagnostics.push({
      code: "PERSISTENCE_MISMATCH",
      severity: "error",
      message:
        "approval.note / prose is not authoritative ArtifactVersion content",
      authoritativeSource: "Phase 8 Artifact Context",
    });
  }

  if (!artifact.data) {
    diagnostics.push({
      code: "ARTIFACT_NOT_FOUND",
      severity: "error",
      message:
        "No already-loaded ArtifactVersion data provided for schema validation",
      authoritativeSource: "OutputQAContext.providedArtifact",
    });
    return { diagnostics, checks, metadata };
  }

  checks.push("artifact_schema");
  const key = artifact.artifactKey ?? context.expectedArtifactKey;
  try {
    if (key && isPresentationKey(key)) {
      const r = validatePresentationArtifactData(key, artifact.data);
      if (!r.ok) {
        diagnostics.push({
          code: "OUTPUT_SCHEMA_INVALID",
          severity: "error",
          message: r.message,
          fieldPath: key,
          authoritativeSource: "cdf/artifacts/presentation/validate",
        });
      }
    } else if (key?.startsWith("packaging.")) {
      const r = validatePackagingArtifactData(key as never, artifact.data);
      if (!r.ok) {
        diagnostics.push({
          code: "OUTPUT_SCHEMA_INVALID",
          severity: "error",
          message: r.message,
          fieldPath: key,
          authoritativeSource: "cdf/artifacts/packaging/validate",
        });
      }
    } else if (key?.startsWith("social-media.")) {
      const r = validateSocialMediaArtifactData(key as never, artifact.data);
      if (!r.ok) {
        diagnostics.push({
          code: "OUTPUT_SCHEMA_INVALID",
          severity: "error",
          message: r.message,
          fieldPath: key,
          authoritativeSource: "cdf/artifacts/social-media/validate",
        });
      }
    } else if (artifact.artifactType) {
      validateArtifactData({
        artifactType: artifact.artifactType as CdfArtifactType,
        schemaVersion: artifact.schemaVersion ?? "1",
        data: artifact.data,
        artifactKey: key,
      });
    } else if (key) {
      diagnostics.push({
        code: "UNSUPPORTED_VALIDATION",
        severity: "error",
        message: `No domain validator mapped for artifact key ${key}`,
        authoritativeSource: "artifact schema registry",
      });
    } else {
      diagnostics.push({
        code: "REQUIRED_FIELD_MISSING",
        severity: "error",
        message: "artifactKey or artifactType required for schema validation",
        authoritativeSource: "OutputQAProvidedArtifact",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      code: "OUTPUT_SCHEMA_INVALID",
      severity: "error",
      message,
      authoritativeSource: "cdf/artifacts/schema-registry.validateArtifactData",
    });
  }

  return { diagnostics, checks, metadata };
}

/** Extract artifact identity from ActionExecution artifact_version / selection / approval payloads. */
export function extractArtifactFromExecutionValue(
  value: unknown,
): OutputQAProvidedArtifact | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as {
    artifact?: {
      artifactId?: string;
      artifactKey?: string;
      artifactType?: string;
      schemaVersion?: string;
      serviceId?: string;
      phaseId?: string;
    };
    version?: {
      artifactId?: string;
      version?: number;
      artifactKey?: string;
      artifactType?: string;
      schemaVersion?: string;
      data?: Record<string, unknown>;
    };
  };
  if (v.version?.artifactId && typeof v.version.version === "number") {
    return {
      artifactId: v.version.artifactId,
      version: v.version.version,
      artifactKey: v.version.artifactKey ?? v.artifact?.artifactKey,
      artifactType: v.version.artifactType ?? v.artifact?.artifactType,
      schemaVersion: v.version.schemaVersion ?? v.artifact?.schemaVersion,
      serviceId: v.artifact?.serviceId,
      phaseId: v.artifact?.phaseId,
      data: v.version.data,
      fromArtifactVersion: true,
    };
  }
  return undefined;
}
