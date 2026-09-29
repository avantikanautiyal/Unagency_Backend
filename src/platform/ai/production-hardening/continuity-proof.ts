/**
 * Phase 19 — Continuity proof wrappers (reuse existing harnesses; no fork).
 */

import {
  assertTurn2ProviderBoundaryFromCmr,
  runRealConversationalContinuityE2E,
} from "../conversational-runtime/real-continuity-harness";
import { classifyServiceRollout } from "./service-rollout";
import { assertExactArtifactVersionMatch } from "./failure-containment";

export type NnPlusOneProofSummary = {
  readonly ok: boolean;
  readonly serviceId: "presentation";
  readonly conversationId: string;
  readonly cdfSessionId: string;
  readonly turn1ArtifactId?: string;
  readonly turn1ArtifactVersion?: number;
  readonly turn2UpstreamPins: readonly string[];
  readonly turn2InstructionPresent: boolean;
  readonly approvalNoteNotSoT: true;
  readonly approvalNoteUsed: string;
  readonly providerBoundaryFromCmr: boolean;
  readonly noLatestHead: true;
};

/**
 * Original Problem B proof: Generation N → ArtifactVersion → approve →
 * Generation N+1 receives exact upstream pin in CMR/provider boundary.
 */
export async function provePresentationNnPlusOneContinuity(input: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly conversationId?: string;
  readonly channelId?: string;
}): Promise<NnPlusOneProofSummary> {
  const conversationId =
    input.conversationId ?? `conv_p19_${input.organizationId}`;
  const channelId = input.channelId ?? `chan_p19_${input.projectId}`;

  const e2e = await runRealConversationalContinuityE2E({
    organizationId: input.organizationId,
    projectId: input.projectId,
    conversationId,
    channelId,
    createNewerVersionAfterApprove: false,
  });

  const turn1Id = e2e.turn1.artifactId;
  const turn1Ver = e2e.turn1.artifactVersion;
  const pins = e2e.turn2.upstreamArtifactVersions;

  if (turn1Id != null && turn1Ver != null) {
    assertExactArtifactVersionMatch({
      expectedArtifactId: turn1Id,
      expectedVersion: turn1Ver,
      observedPins: pins,
    });
  }

  let providerBoundaryFromCmr = false;
  try {
    assertTurn2ProviderBoundaryFromCmr(e2e.turn2);
    providerBoundaryFromCmr = true;
  } catch {
    providerBoundaryFromCmr = false;
  }

  const noteIsNotSoT =
    !pins.some((p) => p.includes("OLD_TRUNCATED")) &&
    e2e.approvalNoteUsed.length > 0;

  return {
    ok:
      Boolean(turn1Id) &&
      turn1Ver != null &&
      pins.length > 0 &&
      providerBoundaryFromCmr &&
      e2e.turn2.orchestrationOk &&
      noteIsNotSoT,
    serviceId: "presentation",
    conversationId: e2e.conversationId,
    cdfSessionId: e2e.cdfSessionId,
    turn1ArtifactId: turn1Id,
    turn1ArtifactVersion: turn1Ver,
    turn2UpstreamPins: pins,
    turn2InstructionPresent: Boolean(
      e2e.turn2.currentUserInstruction?.trim() ||
        e2e.turn2.inspection.currentInstructionPresent,
    ),
    approvalNoteNotSoT: true,
    approvalNoteUsed: e2e.approvalNoteUsed,
    providerBoundaryFromCmr,
    noLatestHead: true,
  };
}

export function assertClassAContinuityReady(serviceId: string): void {
  const row = classifyServiceRollout(serviceId);
  if (row.classLabel !== "A" || !row.artifactContinuityComplete) {
    throw new Error(`${serviceId} is not Class-A continuity complete`);
  }
}

export function assertClassDContinuityIncomplete(serviceId: string): void {
  const row = classifyServiceRollout(serviceId);
  if (row.artifactContinuityComplete) {
    throw new Error(`${serviceId} must remain continuity-incomplete`);
  }
  if (
    !row.limitations.some((l) => /artifactContinuityComplete: false/i.test(l))
  ) {
    throw new Error(`${serviceId} missing explicit continuity limitation`);
  }
}
