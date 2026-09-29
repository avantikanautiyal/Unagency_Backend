/**
 * Adapt session approved[] / selected[] into SourceInput events.
 * Selection ≠ approval. Legacy select_route approval rows are marked legacy_select_compat.
 */

import type { CdfApprovedPhase, CdfSelectedPhase } from "../types";
import { captureSourceAndResolve } from "./service";

export async function captureSelectionDecision(input: {
  sessionId: string;
  serviceId: string;
  projectId?: string;
  userId?: string;
  selected: CdfSelectedPhase;
  /** True when this came from select_route dual-write path. */
  legacyCompatApprovalAlsoWritten?: boolean;
}): Promise<void> {
  await captureSourceAndResolve({
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    projectId: input.projectId,
    userId: input.userId,
    type: "selection",
    rawContent: [
      input.selected.selectedRouteLabel,
      input.selected.routeTitle,
      input.selected.routeDesc,
    ]
      .filter(Boolean)
      .join(" — "),
    source: "cdf_select_route",
    metadata: {
      phaseId: input.selected.phaseId,
      selectedRouteIndex: input.selected.selectedRouteIndex,
      selectedRouteLabel: input.selected.selectedRouteLabel,
      routeTitle: input.selected.routeTitle,
      artifactId: input.selected.artifactId,
      executionId: input.selected.executionId,
      semantic: "selection",
    },
  });

  if (input.legacyCompatApprovalAlsoWritten) {
    await captureSourceAndResolve({
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      projectId: input.projectId,
      userId: input.userId,
      type: "legacy_select_compat",
      rawContent: `legacy_select_compat:${input.selected.phaseId}`,
      source: "cdf_select_route_legacy_approval_row",
      metadata: {
        phaseId: input.selected.phaseId,
        semantic: "legacy_compat_not_canonical_approval",
        note: "select_route still writes approved[] for gate progression; not a user approval",
      },
    });
  }
}

export async function captureApprovalDecision(input: {
  sessionId: string;
  serviceId: string;
  projectId?: string;
  userId?: string;
  approved: CdfApprovedPhase;
}): Promise<void> {
  await captureSourceAndResolve({
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    projectId: input.projectId,
    userId: input.userId,
    type: "approval",
    rawContent: input.approved.note?.trim() || `Approved phase ${input.approved.phaseId}`,
    source: "cdf_approve",
    metadata: {
      phaseId: input.approved.phaseId,
      artifactId: input.approved.artifactId,
      executionId: input.approved.executionId,
      note: input.approved.note,
      semantic: "approval",
    },
  });
}
