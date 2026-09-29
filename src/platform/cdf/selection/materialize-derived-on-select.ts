/**
 * Generic select_route → derived ArtifactVersion materialization.
 *
 * Dispatch is by declared targetArtifactKey from the phase selection contract.
 * No serviceId / phaseId semantic branches.
 */

import type { CdfSessionState } from "../types";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import { ensureDesignSystemOnSelect } from "../presentation-runtime/ensure-design-system-on-select";

export type MaterializeDerivedOnSelectInput = {
  readonly targetArtifactKey: string;
  readonly session: CdfSessionState;
  readonly phaseId: string;
  readonly routeIndex: number;
  readonly routeTitle: string;
  readonly routeDesc?: string;
  readonly routeLabel?: string;
  readonly artifactId?: string;
  readonly artifactVersion?: number;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly userId?: string;
};

export type MaterializeDerivedOnSelectResult = {
  readonly session: CdfSessionState;
  readonly derivedArtifactId: string;
  readonly derivedArtifactVersion: number;
  readonly derivedArtifactKey: string;
};

/**
 * Materialize the declared derived artifact for a selection.
 * Unknown target keys fail closed (caller maps to INVALID_SELECTION).
 */
export function materializeDerivedArtifactOnSelect(
  input: MaterializeDerivedOnSelectInput,
): MaterializeDerivedOnSelectResult {
  const key = input.targetArtifactKey.trim();
  if (!key) {
    throw new Error("materializeDerivedOnSelect.targetArtifactKey is required");
  }

  // Handlers are keyed by artifactKey (contract identity), not service/phase.
  if (key === PRESENTATION_ARTIFACT_KEYS.designSystem) {
    const ensured = ensureDesignSystemOnSelect({
      session: input.session,
      phaseId: input.phaseId,
      routeIndex: input.routeIndex,
      routeTitle: input.routeTitle,
      routeDesc: input.routeDesc,
      routeLabel: input.routeLabel,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      organizationId: input.organizationId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
    });
    return {
      session: ensured.session,
      derivedArtifactId: ensured.designSystemRef.artifactId,
      derivedArtifactVersion: ensured.designSystemRef.version,
      derivedArtifactKey: key,
    };
  }

  if (key === "packaging.dieline") {
    const { ensurePackagingDielineOnSelect } =
      require("../packaging-runtime/ensure-dieline-on-select") as typeof import("../packaging-runtime/ensure-dieline-on-select");
    const ensured = ensurePackagingDielineOnSelect({
      session: input.session,
      phaseId: input.phaseId,
      routeIndex: input.routeIndex,
      routeTitle: input.routeTitle,
      routeDesc: input.routeDesc,
      routeLabel: input.routeLabel,
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      organizationId: input.organizationId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
    });
    return {
      session: ensured.session,
      derivedArtifactId: ensured.dielineRef.artifactId,
      derivedArtifactVersion: ensured.dielineRef.version,
      derivedArtifactKey: key,
    };
  }

  throw new Error(
    `No derived-artifact materializer registered for targetArtifactKey=${key}`,
  );
}
