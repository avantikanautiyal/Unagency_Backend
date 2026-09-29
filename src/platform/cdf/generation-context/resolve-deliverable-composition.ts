/**
 * Resolve deliverable composition requirements for a CDF generation phase.
 * Registry-driven — no serviceId / phaseId / platform branches for semantics.
 * Product grounding (service/subtype) selects declarative composition overlays.
 */

import {
  deliverableCompositionRequiredForPhase,
  resolveDeliverableCompositionContract,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { resolveVideoCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/video-subtype-deliverable-profiles";
import type { CdfDeliverableKind } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf-stage-deliverable";
import { resolveCdfPhaseExecutionContract } from "../canonical";

export type DeliverableCompositionResolution =
  | {
      readonly required: true;
      readonly deliverableKind: CdfDeliverableKind;
      readonly contract: DeliverableCompositionContract;
    }
  | {
      readonly required: true;
      readonly deliverableKind: CdfDeliverableKind;
      readonly contract: null;
      readonly missing: true;
    }
  | {
      readonly required: false;
      readonly deliverableKind?: CdfDeliverableKind;
      readonly contract: null;
    };

export function resolveDeliverableCompositionForPhase(input: {
  readonly serviceId: string;
  readonly phaseId: string;
  readonly service?: string | null;
  readonly subtype?: string | null;
  readonly productKey?: string | null;
}): DeliverableCompositionResolution {
  const exec = resolveCdfPhaseExecutionContract(input);
  if (!exec) {
    return { required: false, contract: null };
  }

  const required = deliverableCompositionRequiredForPhase({
    generationModality: exec.generationModality,
    uxType: exec.semanticRole,
  });

  if (!required) {
    return {
      required: false,
      ...(exec.deliverableKind ? { deliverableKind: exec.deliverableKind } : {}),
      contract: null,
    };
  }

  const kind = exec.deliverableKind;
  if (!kind) {
    return {
      required: true,
      deliverableKind: "generic_visual",
      contract: null,
      missing: true,
    };
  }

  const contract =
    kind === "video" || kind === "storyboard_frame"
      ? resolveVideoCompositionContract({
          deliverableKind: kind,
          service: input.service ?? null,
          subtype: input.subtype ?? null,
          productKey: input.productKey ?? null,
          phaseId: input.phaseId,
        }) ?? resolveDeliverableCompositionContract(kind)
      : resolveDeliverableCompositionContract(kind);
  if (!contract) {
    return {
      required: true,
      deliverableKind: kind,
      contract: null,
      missing: true,
    };
  }

  return {
    required: true,
    deliverableKind: kind,
    contract,
  };
}
