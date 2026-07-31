/**
 * ToolExecutor — resolve → validate → authorize → claim → handler → sanitize.
 */

import { success, type Result } from "../../../shared/result";
import type {
  ToolAuthorizationDecision,
  ToolCall,
  ToolExecutionResult,
  ToolFailureCategory,
} from "../contracts/tool-contracts";
import type { IToolRegistry } from "../registry/in-memory-tool-registry";
import { authorizeToolInvocation } from "../auth/tool-authorization";
import { validateAgainstJsonSchema } from "../schema/json-schema-validator";
import {
  buildToolInvocationKey,
  hashToolDefinitionVersion,
  type IToolInvocationStore,
} from "../idempotency/tool-invocation-store";
import { sanitizeToolResult } from "../safety/tool-result-sanitizer";

export interface ToolExecutorContext {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly principalUserId?: string;
  readonly roles?: readonly string[];
  readonly executionId: string;
  readonly round: number;
  readonly workerId?: string;
  readonly allowedToolNames?: readonly string[];
  readonly deniedToolNames?: readonly string[];
  readonly requireApprovalForSideEffects?: boolean;
}

export interface ToolExecutorDeps {
  readonly registry: IToolRegistry;
  readonly invocationStore: IToolInvocationStore;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly defaultTimeoutMs?: number;
}

export class ToolExecutor {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly deps: ToolExecutorDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.defaultTimeoutMs = deps.defaultTimeoutMs ?? 5_000;
  }

  async execute(
    call: ToolCall,
    context: ToolExecutorContext
  ): Promise<Result<ToolExecutionResult>> {
    const start = this.clockMs();
    const invocationKey = buildToolInvocationKey({
      organizationId: context.organizationId,
      executionId: context.executionId,
      round: context.round,
      toolCallId: call.id,
      toolName: call.name,
    });

    const registered = this.deps.registry.resolve(call.name);
    if (!registered) {
      return success(
        this.fail(
          call,
          invocationKey,
          context.round,
          start,
          "tool_not_found",
          `Unknown tool '${call.name}'`
        )
      );
    }

    const argsOk = validateAgainstJsonSchema(call.arguments, registered.definition.inputSchema, {
      allowAdditionalProperties: false,
    });
    if (!argsOk.ok) {
      return success(
        this.fail(
          call,
          invocationKey,
          context.round,
          start,
          "tool_argument_invalid",
          argsOk.error.message,
          "deny"
        )
      );
    }

    const auth = authorizeToolInvocation({
      tool: registered.definition,
      context: {
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        principalUserId: context.principalUserId,
        roles: context.roles,
        executionId: context.executionId,
        arguments: call.arguments,
      },
      requireApprovalForSideEffects: context.requireApprovalForSideEffects,
      allowedToolNames: context.allowedToolNames,
      deniedToolNames: context.deniedToolNames,
    });

    if (auth.decision === "deny") {
      return success(
        this.fail(
          call,
          invocationKey,
          context.round,
          start,
          "tool_unauthorized",
          auth.reason,
          "deny"
        )
      );
    }
    if (auth.decision === "requires_approval") {
      // If already approved durably, fall through to claim/execute.
      const existing = await this.deps.invocationStore.get(invocationKey);
      if (existing?.approval?.decision === "approve" && !existing.result) {
        // recheck auth after approval — already passed above
      } else if (existing?.approval?.decision === "reject") {
        return success(
          this.fail(
            call,
            invocationKey,
            context.round,
            start,
            "tool_unauthorized",
            "Tool approval rejected",
            "deny"
          )
        );
      } else if (!existing?.approval) {
        const result: ToolExecutionResult = {
          toolCallId: call.id,
          toolName: call.name,
          status: "awaiting_approval",
          error: { category: "tool_approval_required", message: auth.reason },
          latencyMs: this.clockMs() - start,
          authorizationDecision: "requires_approval",
          invocationKey,
          round: context.round,
        };
        await this.deps.invocationStore.upsertAwaitingApproval({
          invocationKey,
          organizationId: context.organizationId,
          executionId: context.executionId,
          round: context.round,
          toolCallId: call.id,
          toolName: call.name,
          riskClass: registered.definition.riskClass,
          toolDefinitionVersion: hashToolDefinitionVersion({
            name: registered.definition.name,
            riskClass: registered.definition.riskClass,
            inputSchema: registered.definition.inputSchema,
          }),
          status: "awaiting_approval",
          authorizationDecision: "requires_approval",
          createdAt: this.nowIso(),
          updatedAt: this.nowIso(),
        });
        return success(result);
      }
    }

    const claim = await this.deps.invocationStore.tryClaim({
      invocationKey,
      organizationId: context.organizationId,
      executionId: context.executionId,
      round: context.round,
      toolCallId: call.id,
      toolName: call.name,
      workerId: context.workerId ?? "worker",
      nowIso: this.nowIso(),
    });

    if (!claim.claimed) {
      if (claim.record.result) {
        return success({
          ...claim.record.result,
          status:
            claim.record.result.status === "succeeded"
              ? "skipped_idempotent"
              : claim.record.result.status,
        });
      }
      // Same worker already holds the lease (approval resume path).
      if (
        claim.record.status === "running" &&
        claim.record.claimedBy === (context.workerId ?? "worker")
      ) {
        // fall through to handler
      } else {
        return success(
          this.fail(
            call,
            invocationKey,
            context.round,
            start,
            "tool_execution_failed",
            "Invocation already claimed by another worker",
            "allow"
          )
        );
      }
    }

    // After approval: refuse if registry definition drifted under the same approval.
    if (
      claim.record.toolDefinitionVersion ||
      (await this.deps.invocationStore.get(invocationKey))?.toolDefinitionVersion
    ) {
      const stored =
        claim.record.toolDefinitionVersion ??
        (await this.deps.invocationStore.get(invocationKey))?.toolDefinitionVersion;
      const current = hashToolDefinitionVersion({
        name: registered.definition.name,
        riskClass: registered.definition.riskClass,
        inputSchema: registered.definition.inputSchema,
      });
      if (stored && stored !== current) {
        const result = this.fail(
          call,
          invocationKey,
          context.round,
          start,
          "tool_unauthorized",
          "Tool definition changed since approval — refusing execution",
          "deny"
        );
        await this.deps.invocationStore.complete(invocationKey, result, this.nowIso());
        return success(result);
      }
    }

    try {
      const raw = await withTimeout(
        Promise.resolve(
          registered.handler({
            arguments: call.arguments,
            organizationId: context.organizationId,
            executionId: context.executionId,
            invocationKey,
          })
        ),
        this.defaultTimeoutMs
      );
      const result: ToolExecutionResult = {
        toolCallId: call.id,
        toolName: call.name,
        status: "succeeded",
        output: sanitizeToolResult(raw),
        latencyMs: this.clockMs() - start,
        authorizationDecision: "allow",
        invocationKey,
        round: context.round,
      };
      await this.deps.invocationStore.complete(invocationKey, result, this.nowIso());
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "tool execution failed";
      const category: ToolFailureCategory =
        /timeout/i.test(message) ? "tool_timeout" : "tool_execution_failed";
      const result = this.fail(
        call,
        invocationKey,
        context.round,
        start,
        category,
        message,
        "allow"
      );
      await this.deps.invocationStore.complete(invocationKey, result, this.nowIso());
      return success(result);
    }
  }

  private fail(
    call: ToolCall,
    invocationKey: string,
    round: number,
    start: number,
    category: ToolFailureCategory,
    message: string,
    authorizationDecision?: ToolAuthorizationDecision
  ): ToolExecutionResult {
    return {
      toolCallId: call.id,
      toolName: call.name,
      status:
        category === "tool_approval_required"
          ? "awaiting_approval"
          : category === "tool_unauthorized" || category === "tool_argument_invalid"
            ? "denied"
            : category === "tool_timeout"
              ? "timeout"
              : "failed",
      error: { category, message },
      latencyMs: this.clockMs() - start,
      authorizationDecision,
      invocationKey,
      round,
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tool timeout after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}
