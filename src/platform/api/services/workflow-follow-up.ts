/**
 * Case 2 compound workflow — server-side linked follow-up payload.
 */

import type { ServiceContextWorkflow } from "../../os/brief/engine/service-context-classifier";

export interface WorkflowFollowUpPayload {
  readonly parentExecutionId: string;
  readonly parentProjectTitle?: string;
  readonly prompt: string;
  readonly followUp: {
    readonly service: string;
    readonly subtype?: string;
    readonly platform?: string;
    readonly format?: string;
    readonly label: string;
  };
  readonly brandId?: string;
  readonly queuedAt: string;
  readonly consumed?: boolean;
}

export function buildWorkflowFollowUpFromMetadata(input: {
  readonly executionId: string;
  readonly prompt: string;
  readonly workflow: ServiceContextWorkflow;
  readonly brandId?: string;
  readonly nowIso: () => string;
}): WorkflowFollowUpPayload | undefined {
  const phase = input.workflow.phases.find((p) => p.role === "follow_up");
  if (!phase) return undefined;
  const sel = phase.selection;
  return {
    parentExecutionId: input.executionId,
    parentProjectTitle: input.workflow.parentProjectTitle,
    prompt: phase.promptSnippet?.trim() || input.prompt,
    brandId: input.brandId,
    queuedAt: input.nowIso(),
    followUp: {
      service: String(sel.service ?? "content"),
      subtype: sel.subtype ?? undefined,
      platform: sel.platform ?? undefined,
      format: sel.format ?? undefined,
      label: sel.label ?? String(sel.service ?? "Follow-up"),
    },
  };
}
