/**
 * On canonical select_route for Presentation design-routes:
 * ensure design-route artifact + derive design-system (exact versions).
 * Selection ≠ approval. Idempotent on repeated CTA.
 */

import {
  applyArtifactEngineOnSelect,
  getArtifactVersion,
  isCdfCanonicalArtifactId,
  upsertSessionArtifactRef,
} from "../artifacts";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import type { PresentationDesignRouteData } from "../artifacts/presentation/types";
import { ingestGenerationCompletion } from "../generation-artifact";
import type { CdfSessionState } from "../types";
import { deriveDesignSystemFromRoute } from "./derive-design-system";

export type EnsureDesignSystemOnSelectInput = {
  session: CdfSessionState;
  phaseId: string;
  routeIndex: number;
  routeTitle: string;
  routeDesc?: string;
  routeLabel?: string;
  /** Existing design-route cdfart_* if FE already has one. */
  artifactId?: string;
  artifactVersion?: number;
  organizationId?: string;
  projectId?: string;
  workspaceId?: string;
  userId?: string;
};

export type EnsureDesignSystemOnSelectResult = {
  session: CdfSessionState;
  designRouteRef: { artifactId: string; version: number };
  designSystemRef: { artifactId: string; version: number };
  idempotent: boolean;
};

function routePayload(input: EnsureDesignSystemOnSelectInput) {
  return {
    name: input.routeTitle,
    title: input.routeTitle,
    label: input.routeLabel ?? input.routeTitle,
    description: input.routeDesc,
    desc: input.routeDesc,
    colorDirection: "Navy primary #0B1F3A with green accent #2ECC71",
    typographyDirection: "Clean sans-serif executive hierarchy",
    layoutDirection: "48px margins, bold title slides",
    visualRationale: input.routeDesc || input.routeTitle,
  };
}

/**
 * Materialize design-route (if needed) + design-system from explicit selection.
 */
export function ensureDesignSystemOnSelect(
  input: EnsureDesignSystemOnSelectInput,
): EnsureDesignSystemOnSelectResult {
  const session = input.session;
  const org = input.organizationId ?? session.organizationId;
  const projectId = input.projectId ?? session.projectId;

  // Idempotent: already have selected design-system for this phase
  const existingDs = session.selectedArtifacts?.find(
    (r) =>
      r.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem &&
      (r.phaseId === "select" || r.phaseId === input.phaseId),
  );
  const existingRoute = session.selectedArtifacts?.find(
    (r) =>
      r.artifactKey === PRESENTATION_ARTIFACT_KEYS.designRoute &&
      r.phaseId === input.phaseId,
  );
  // Fast path: caller explicitly re-sent the exact route handle already
  // pinned. Any other case (no explicit handle, or a handle pointing at a
  // different route) must fall through to re-materialize below — the bare
  // presence of *some* existing pin does not prove it matches this
  // selection.
  if (
    existingDs &&
    existingRoute &&
    input.artifactId &&
    input.artifactVersion != null &&
    existingRoute.artifactId === input.artifactId &&
    existingRoute.version === input.artifactVersion
  ) {
    return {
      session,
      designRouteRef: {
        artifactId: existingRoute.artifactId,
        version: existingRoute.version,
      },
      designSystemRef: {
        artifactId: existingDs.artifactId,
        version: existingDs.version,
      },
      idempotent: true,
    };
  }
  // Same route re-clicked (no explicit handle, but this is the exact
  // routeIndex that produced the existing pin) is a true no-op. A missing
  // selectionRouteIndex (pin predates this field, or a genuinely different
  // route) falls through and re-materializes below rather than assuming
  // identity.
  if (
    existingDs &&
    existingRoute &&
    !input.artifactId &&
    existingRoute.selectionRouteIndex === input.routeIndex
  ) {
    return {
      session,
      designRouteRef: {
        artifactId: existingRoute.artifactId,
        version: existingRoute.version,
      },
      designSystemRef: {
        artifactId: existingDs.artifactId,
        version: existingDs.version,
      },
      idempotent: true,
    };
  }

  let designRouteRef: { artifactId: string; version: number };
  let routeData: PresentationDesignRouteData;

  if (
    input.artifactId &&
    isCdfCanonicalArtifactId(input.artifactId) &&
    input.artifactVersion != null
  ) {
    designRouteRef = {
      artifactId: input.artifactId,
      version: input.artifactVersion,
    };
    routeData = getArtifactVersion(input.artifactId, input.artifactVersion, {
      organizationId: org,
      projectId,
    }).data as unknown as PresentationDesignRouteData;
  } else {
    const routeIngest = ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "presentation",
      phaseId: input.phaseId,
      organizationId: org,
      workspaceId: input.workspaceId ?? session.workspaceId,
      projectId,
      userId: input.userId ?? session.userId,
      rawOutput: routePayload(input),
      routeIndex: input.routeIndex,
      activeBriefId: session.activeBriefId,
      activeBriefVersion: session.activeBriefVersion,
      // Session CAS bump may not be persisted yet during select_route — skip stale pin.
      requestId: `m7_select_route_${session.sessionId}_${input.phaseId}_${input.routeIndex}`,
      requireAcceptanceGate: true,
      requirements: [],
    });
    designRouteRef = {
      artifactId: routeIngest.artifactId,
      version: routeIngest.artifactVersion,
    };
    routeData = routeIngest.candidate.normalizedOutput as unknown as PresentationDesignRouteData;
  }

  const dsData = deriveDesignSystemFromRoute(routeData, designRouteRef);
  const dsIngest = ingestGenerationCompletion({
    sessionId: session.sessionId,
    serviceId: "presentation",
    phaseId: "select",
    organizationId: org,
    workspaceId: input.workspaceId ?? session.workspaceId,
    projectId,
    userId: input.userId ?? session.userId,
    rawOutput: dsData,
    designRouteRef,
    activeBriefId: session.activeBriefId,
    activeBriefVersion: session.activeBriefVersion,
    requestId: `m7_select_ds_${session.sessionId}_${designRouteRef.artifactId}_v${designRouteRef.version}`,
    requireAcceptanceGate: true,
    requirements: [],
    sourceArtifacts: [
      {
        artifactId: designRouteRef.artifactId,
        version: designRouteRef.version,
        artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
        relationship: "derived_from",
      },
    ],
  });

  let next = upsertSessionArtifactRef(session, {
    artifactId: designRouteRef.artifactId,
    version: designRouteRef.version,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
    phaseId: input.phaseId,
    role: "selected",
    selectionRouteIndex: input.routeIndex,
  });
  next = applyArtifactEngineOnSelect({
    session: next,
    phaseId: "select",
    artifactId: dsIngest.artifactId,
    artifactVersion: dsIngest.artifactVersion,
    artifactKey: PRESENTATION_ARTIFACT_KEYS.designSystem,
    organizationId: org,
    projectId,
    selectionRouteIndex: input.routeIndex,
  });

  console.info(
    JSON.stringify({
      scope: "cdf.presentation_runtime",
      event: "design_system_on_select",
      sessionId: session.sessionId,
      phaseId: input.phaseId,
      designRouteArtifactId: designRouteRef.artifactId,
      designRouteVersion: designRouteRef.version,
      designSystemArtifactId: dsIngest.artifactId,
      designSystemVersion: dsIngest.artifactVersion,
      validationStatus: dsIngest.validationStatus,
      ts: new Date().toISOString(),
    }),
  );

  return {
    session: next,
    designRouteRef,
    designSystemRef: {
      artifactId: dsIngest.artifactId,
      version: dsIngest.artifactVersion,
    },
    idempotent: false,
  };
}
