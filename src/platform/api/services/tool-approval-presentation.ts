/**
 * Safe tool-approval presentation for Enterprise ExecutionResource (M10.7).
 * Never expose credentials, system prompts, or raw secret-bearing payloads.
 */

import type { ToolInvocationRecord } from "../../providers/tools/idempotency/tool-invocation-store";

export interface PendingToolApprovalPresentation {
  readonly invocationId: string;
  readonly toolName: string;
  readonly displayName: string;
  readonly description: string;
  readonly riskClass?: string;
  readonly argumentsSummary: Readonly<Record<string, unknown>>;
  readonly requestedAt: string;
}

const TOOL_UX: Record<
  string,
  { displayName: string; description: string; consequence: string }
> = {
  update_test_record: {
    displayName: "Save draft record",
    description: "Create or update a draft test record in your workspace.",
    consequence: "This creates a draft only. Nothing will be published.",
  },
  lookup_campaign: {
    displayName: "Look up campaign",
    description: "Read campaign details from your organisation.",
    consequence: "Read-only — no changes will be made.",
  },
  calculate_metric: {
    displayName: "Calculate metric",
    description: "Run a deterministic metric calculation.",
    consequence: "Read-only computation — no side effects.",
  },
};

export function buildPendingApprovals(
  records: readonly ToolInvocationRecord[]
): readonly PendingToolApprovalPresentation[] {
  return records
    .filter((r) => r.status === "awaiting_approval")
    .map((r) => toPendingApproval(r));
}

export function toPendingApproval(
  record: ToolInvocationRecord
): PendingToolApprovalPresentation {
  const ux = TOOL_UX[record.toolName];
  const rawArgs =
    record.checkpoint?.pendingToolCall?.arguments ??
    ({} as Readonly<Record<string, unknown>>);
  return {
    invocationId: record.invocationKey,
    toolName: record.toolName,
    displayName: ux?.displayName ?? humanizeToolName(record.toolName),
    description:
      ux?.description ??
      `AI requested permission to run “${record.toolName}”.`,
    riskClass: record.riskClass,
    argumentsSummary: sanitizeArgumentsSummary(rawArgs),
    requestedAt: record.createdAt,
  };
}

export function humanizeToolName(name: string): string {
  return name
    .split(/[._]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Mask emails / truncate long strings — never dump raw payloads. */
export function sanitizeArgumentsSummary(
  args: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      if (/email/i.test(key) || value.includes("@")) {
        out[key] = maskEmail(value);
      } else {
        out[key] = value.length > 80 ? `${value.slice(0, 77)}…` : value;
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (value == null) {
      out[key] = null;
    } else if (Array.isArray(value)) {
      out[key] = { count: value.length };
    } else {
      out[key] = { type: "object" };
    }
  }
  return Object.freeze(out);
}

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const maskedLocal =
    local.length <= 1 ? "*" : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

export function consequenceForTool(toolName: string): string {
  return (
    TOOL_UX[toolName]?.consequence ??
    "Review this action carefully before approving."
  );
}
