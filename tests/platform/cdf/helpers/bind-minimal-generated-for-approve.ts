/**
 * Test helper — bind minimal canonical ArtifactVersion pins so approve/advance
 * smoke tests satisfy:
 *   1) upstream dependency roles (exact X@V)
 *   2) current-phase generated completion for approval
 *
 * Contract-driven; no serviceId/phaseId product branches.
 */

import {
  applyCdfTransition,
  createArtifact,
  getCdfSession,
  markValidated,
  saveCdfSession,
  upsertSessionArtifactRef,
  type CdfSessionState,
} from "../../../../src/platform/cdf";
import {
  resolveCdfPhaseDefinition,
  resolveCdfPhaseExecutionContract,
  tryResolveCdfPhaseDependencies,
} from "../../../../src/platform/cdf/canonical";

function artifactTypeForContract(
  artifactType: string | undefined,
):
  | "text_doc"
  | "structured_doc"
  | "text_choice"
  | "image"
  | "image_set"
  | "video"
  | "deck"
  | "document"
  | "pack"
  | "logo"
  | "config_choice" {
  const t = (artifactType || "text_doc") as
    | "text_doc"
    | "structured_doc"
    | "text_choice"
    | "image"
    | "image_set"
    | "video"
    | "deck"
    | "document"
    | "pack"
    | "logo"
    | "config_choice";
  return t;
}

function fixtureData(
  artifactKey: string,
  artifactType: string,
  phaseId: string,
): Record<string, unknown> {
  // Prefer registered service fixtures when the key has a strict schema overlay.
  if (artifactKey === "social-media.routes") {
    const { fixtureSocialMediaRoutes } = require("../../../../src/platform/cdf/artifacts/social-media/fixtures");
    return fixtureSocialMediaRoutes() as Record<string, unknown>;
  }
  if (artifactKey === "social-media.output") {
    const {
      fixtureSocialMediaOutput,
      SOCIAL_MEDIA_FIXTURE_IDS,
    } = require("../../../../src/platform/cdf/artifacts/social-media/fixtures");
    return fixtureSocialMediaOutput(
      SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
      1,
    ) as Record<string, unknown>;
  }
  if (artifactKey === "packaging.routes" || artifactKey === "packaging.design-routes") {
    const { fixturePackagingRoutes } = require("../../../../src/platform/cdf/artifacts/packaging/fixtures");
    return fixturePackagingRoutes() as Record<string, unknown>;
  }
  if (artifactKey === "packaging.dieline") {
    const { fixturePackagingDieline } = require("../../../../src/platform/cdf/artifacts/packaging/fixtures");
    return fixturePackagingDieline() as Record<string, unknown>;
  }
  if (artifactKey === "packaging.3d-direction") {
    const { fixturePackaging3dDirection } = require("../../../../src/platform/cdf/artifacts/packaging/fixtures");
    return fixturePackaging3dDirection() as Record<string, unknown>;
  }
  if (artifactKey === "packaging.front-pack") {
    const { fixturePackagingFrontPack } = require("../../../../src/platform/cdf/artifacts/packaging/fixtures");
    return fixturePackagingFrontPack() as Record<string, unknown>;
  }
  if (artifactKey === "presentation.storyline") {
    const { fixturePresentationStoryline } = require("../../../../src/platform/cdf/artifacts/presentation/fixtures");
    return fixturePresentationStoryline() as Record<string, unknown>;
  }

  if (artifactType === "text_choice" || artifactType === "config_choice") {
    return { choices: [{ id: "choice_1", title: "Choice 1" }] };
  }
  if (
    artifactType === "image" ||
    artifactType === "image_set" ||
    artifactType === "logo" ||
    artifactType === "video"
  ) {
    return { preview: true, label: `${phaseId} fixture` };
  }
  return { body: `${phaseId} fixture` };
}

function ensurePin(input: {
  session: CdfSessionState;
  phaseId: string;
  artifactKey: string;
  artifactType: string;
  role: "generated" | "selected" | "approved";
  organizationId: string;
  projectId: string;
}): CdfSessionState {
  const existing =
    (input.role === "approved"
      ? input.session.approvedArtifacts
      : input.role === "selected"
        ? input.session.selectedArtifacts
        : input.session.generatedArtifacts
    )?.find(
      (r) =>
        r.phaseId === input.phaseId &&
        (r.artifactKey === input.artifactKey || r.artifactKey === "unknown"),
    );
  if (existing) return input.session;

  const artifactType = artifactTypeForContract(input.artifactType);
  const created = createArtifact({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.session.sessionId,
    serviceId: input.session.serviceId,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey,
    artifactType,
    data: fixtureData(input.artifactKey, artifactType, input.phaseId) as never,
    ...(artifactType === "image" ||
    artifactType === "image_set" ||
    artifactType === "logo" ||
    artifactType === "video"
      ? {
          provenance: {
            vaultAssetIds: ["507f1f77bcf86cd799439099"],
          },
        }
      : {}),
  });
  markValidated(created.artifact.artifactId, 1);
  let next = upsertSessionArtifactRef(input.session, {
    artifactId: created.artifact.artifactId,
    version: 1,
    phaseId: input.phaseId,
    artifactKey: input.artifactKey,
    role: "generated",
  });
  if (input.role === "selected" || input.role === "approved") {
    next = upsertSessionArtifactRef(next, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: input.phaseId,
      artifactKey: input.artifactKey,
      role: input.role,
    });
  }
  return next;
}

/**
 * Ensure upstream deps + current-phase generated pin exist.
 * Returns identity for the current-phase pin (for approve request).
 */
export function bindMinimalGeneratedForApprove(
  sessionId: string,
  opts?: { organizationId?: string; projectId?: string },
): {
  session: CdfSessionState;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
} | null {
  let session = getCdfSession(sessionId);
  if (!session?.phaseId) return null;

  const contract = resolveCdfPhaseExecutionContract({
    serviceId: session.serviceId,
    phaseId: session.phaseId,
  });
  if (!contract?.requiresCanonicalCreate) return null;

  const organizationId =
    opts?.organizationId ?? session.organizationId ?? "org_test";
  const projectId = opts?.projectId ?? session.projectId ?? "proj_test";

  const deps = tryResolveCdfPhaseDependencies(
    session.serviceId,
    session.phaseId,
  );
  if (deps.ok) {
    for (const d of deps.dependencies) {
      const upstream = resolveCdfPhaseDefinition(session.serviceId, d.phaseId);
      const upstreamContract = resolveCdfPhaseExecutionContract({
        serviceId: session.serviceId,
        phaseId: d.phaseId,
        phase: upstream,
      });
      // Config / none modality often have no cdfart — skip when no canonical create
      if (
        upstream &&
        (upstream.generationModality === "none" ||
          upstream.artifact.artifactType === "none" ||
          upstream.artifact.artifactType === "config_choice")
      ) {
        continue;
      }
      if (!upstreamContract?.requiresCanonicalCreate && !d.artifactKey) {
        continue;
      }
      const role =
        d.requiredRole === "approved"
          ? "approved"
          : d.requiredRole === "selected"
            ? "selected"
            : "generated";
      session = ensurePin({
        session,
        phaseId: d.phaseId,
        artifactKey:
          d.artifactKey ||
          upstreamContract?.artifactKey ||
          upstream?.artifact.artifactKey ||
          `${session.serviceId}.${d.phaseId}`,
        artifactType:
          upstreamContract?.artifactType ||
          upstream?.artifact.artifactType ||
          "text_doc",
        role,
        organizationId,
        projectId,
      });
    }
  }

  session = ensurePin({
    session,
    phaseId: session.phaseId,
    artifactKey: contract.artifactKey,
    artifactType: contract.artifactType,
    role: "generated",
    organizationId,
    projectId,
  });
  saveCdfSession(session);
  session = getCdfSession(sessionId)!;
  const pin = session.generatedArtifacts?.find(
    (r) =>
      r.phaseId === session!.phaseId &&
      r.artifactKey === contract.artifactKey,
  );
  if (!pin) return null;
  return {
    session,
    artifactId: pin.artifactId,
    artifactVersion: pin.version,
    artifactKey: contract.artifactKey,
  };
}

/** Approve current phase with bound exact identity when canonical. */
export function approveWithCanonicalCompletion(sessionId: string) {
  const bound = bindMinimalGeneratedForApprove(sessionId);
  const session = getCdfSession(sessionId)!;
  return applyCdfTransition({
    sessionId,
    action: "approve",
    expectedVersion: session.sessionVersion,
    ...(bound
      ? {
          artifactId: bound.artifactId,
          artifactVersion: bound.artifactVersion,
          artifactKey: bound.artifactKey,
        }
      : {}),
  });
}
