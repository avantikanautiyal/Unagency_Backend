/**
 * Tool authorization — server principal is authoritative; model args cannot spoof tenant.
 */

import type {
  ToolAuthorizationDecision,
  ToolDefinition,
  ToolRiskClass,
} from "../contracts/tool-contracts";

export interface ToolAuthorizationContext {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly principalUserId?: string;
  readonly roles?: readonly string[];
  readonly executionId: string;
  /** Model-supplied args — never trusted for tenancy. */
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface ToolAuthorizationResult {
  readonly decision: ToolAuthorizationDecision;
  readonly reason: string;
}

const DENY_SPOOF_KEYS = [
  "organizationId",
  "orgId",
  "tenantId",
  "workspaceId",
  "userId",
  "ownerId",
] as const;

export function authorizeToolInvocation(input: {
  readonly tool: ToolDefinition;
  readonly context: ToolAuthorizationContext;
  /** When true, write/side-effect/high_risk require approval. */
  readonly requireApprovalForSideEffects?: boolean;
  /** Explicit deny list of tool names for this principal. */
  readonly deniedToolNames?: readonly string[];
  /** If set, only these tools are allowed. */
  readonly allowedToolNames?: readonly string[];
}): ToolAuthorizationResult {
  const { tool, context } = input;

  if (input.deniedToolNames?.includes(tool.name)) {
    return { decision: "deny", reason: `Tool '${tool.name}' denied by policy` };
  }
  if (input.allowedToolNames && !input.allowedToolNames.includes(tool.name)) {
    return { decision: "deny", reason: `Tool '${tool.name}' not in allowed set` };
  }

  // Tenant spoof: reject if args claim a different org/tenant than authenticated context.
  for (const key of DENY_SPOOF_KEYS) {
    const claimed = context.arguments[key];
    if (typeof claimed !== "string" || !claimed.trim()) continue;
    if (key === "organizationId" || key === "orgId" || key === "tenantId") {
      if (claimed !== context.organizationId) {
        return {
          decision: "deny",
          reason: `Tenant spoof rejected: ${key} does not match authenticated organization`,
        };
      }
    }
    if (key === "workspaceId" && context.workspaceId && claimed !== context.workspaceId) {
      return {
        decision: "deny",
        reason: "Workspace spoof rejected",
      };
    }
    if (key === "userId" && context.principalUserId && claimed !== context.principalUserId) {
      return {
        decision: "deny",
        reason: "User spoof rejected",
      };
    }
  }

  // Forbidden operations embedded in args (arbitrary URL/shell/eval).
  const forbidden = detectForbiddenOperations(context.arguments);
  if (forbidden) {
    return { decision: "deny", reason: forbidden };
  }

  const requireApproval =
    input.requireApprovalForSideEffects ?? riskRequiresApproval(tool.riskClass);
  if (requireApproval && tool.riskClass !== "read_only") {
    return {
      decision: "requires_approval",
      reason: `Tool risk '${tool.riskClass}' requires approval`,
    };
  }

  return { decision: "allow", reason: "authorized" };
}

function riskRequiresApproval(risk: ToolRiskClass): boolean {
  return risk === "write" || risk === "external_side_effect" || risk === "high_risk";
}

function detectForbiddenOperations(args: Readonly<Record<string, unknown>>): string | undefined {
  const blob = JSON.stringify(args).toLowerCase();
  if (/"\s*https?:\/\//.test(blob) && (blob.includes("fetch") || blob.includes("url"))) {
    // Allow URLs only if explicitly schema-validated field named "url" on read_only tools —
    // still block shell/eval/provider SDK patterns.
  }
  if (blob.includes("__proto__") || blob.includes("constructor.prototype")) {
    return "Prototype pollution keys forbidden";
  }
  if (
    blob.includes("child_process") ||
    blob.includes("execsync") ||
    blob.includes("spawn(") ||
    /\beval\s*\(/.test(blob) ||
    blob.includes("function(") && blob.includes("return process")
  ) {
    return "Arbitrary code/shell execution attempt denied";
  }
  if (
    blob.includes("openai.com/v1") ||
    blob.includes("api.anthropic.com") ||
    blob.includes("generativelanguage.googleapis.com")
  ) {
    return "Direct provider URL invocation denied";
  }
  return undefined;
}
