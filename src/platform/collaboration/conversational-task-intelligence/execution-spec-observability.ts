/**
 * Priority 4.6 — Execution specification observability.
 */

import { sanitizeOsLogFields } from "../../os/observability/execution-log";
import type { CanonicalExecutionSpecification } from "./execution-specification";

export const EXECUTION_SPEC_TRACE_PREFIX =
  "[UNAGENCY-EXECUTION-SPEC]" as const;

export function logExecutionSpecResolution(input: {
  readonly conversationId?: string;
  readonly channelId?: string;
  readonly threadId?: string;
  readonly executionId?: string;
  readonly spec: CanonicalExecutionSpecification;
}): void {
  try {
    const { spec } = input;
    const payload = sanitizeOsLogFields({
      conversationId: input.conversationId,
      channelId: input.channelId,
      threadId: input.threadId,
      executionId: input.executionId,
      planeVersion: spec.planeVersion,
      resolutionState: spec.resolutionState,
      resolvedAction: spec.task.action?.value,
      objectiveExplicit: spec.task.objective?.provenance.explicit ?? false,
      quantity: spec.content.quantity?.value,
      quantityExplicit: spec.content.quantity?.provenance.explicit ?? false,
      outputMode: spec.outputIntent.mode.value,
      outputModeExplicit: spec.outputIntent.mode.provenance.explicit ?? false,
      deliverables: spec.deliverables.map((d) => ({
        format: d.format,
        explicit: d.provenance.explicit,
      })),
      deliverableCount: spec.deliverables.length,
      unsupportedDeliverables: spec.unsupportedDeliverables,
      clarificationRequired: spec.resolutionState === "CLARIFICATION_REQUIRED",
      dimensions:
        spec.technical.width?.value && spec.technical.height?.value
          ? `${spec.technical.width.value}x${spec.technical.height.value}`
          : undefined,
      pageCount: spec.technical.pageCount?.value,
      contentItemCount: spec.content.contentItems?.length ?? 0,
      ...constraintObservabilitySummary(
        (spec.creative.negativeConstraints ?? []).map((c) => c.value),
      ),
    });
    console.log(EXECUTION_SPEC_TRACE_PREFIX, JSON.stringify(payload));
  } catch {
    // Observability must never break resolution flow.
  }
}
