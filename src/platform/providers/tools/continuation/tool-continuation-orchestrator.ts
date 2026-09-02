/**
 * ToolContinuationOrchestrator — provider-neutral tool loop around IProviderRuntime.
 *
 * Does NOT replace Provider Runtime. Does NOT failover providers after side effects.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../core/identifiers";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../../runtime/contracts/provider-execution-response";
import type { IProviderRuntime } from "../../runtime/interfaces/provider-runtime";
import type { ToolExecutor } from "../executor/tool-executor";
import type { ToolExecutionConfig } from "../config/tool-execution-config";
import type {
  StructuredOutputRequest,
  ToolOrchestrationSummary,
  ToolRoundSummary,
  ToolExecutionResult,
} from "../contracts/tool-contracts";
import {
  buildContinuationMessages,
  normalizeOpenAIToolCalls,
  outputHasToolCalls,
  toOpenAIToolDefinitions,
} from "../normalization/tool-call-normalization";
import type { ToolDefinition } from "../contracts/tool-contracts";
import {
  validateSchemaDocument,
} from "../schema/json-schema-validator";
import {
  attachStructuredOutputWithPresentationGate,
  coerceJsonText,
  isGeminiWebsiteHtmlPassthrough,
  normalizeSchemaForOpenAiStrict,
  parseOrRecoverStructuredOutput,
  withStructuredOutputRequest,
} from "../structured/structured-output-execution";
import {
  buildWebProjectInstructionBlock,
  isProviderOutputTruncated,
  websiteContextFromMetadata,
} from "../../../os/delivery/website-generation";
import { sanitizeExecutionFeatures } from "../../adapters/capabilities/feature-catalog";
import type { IToolInvocationStore } from "../idempotency/tool-invocation-store";

export interface ToolContinuationRequest {
  readonly providerRequest: ProviderExecutionRequest;
  readonly tools: readonly ToolDefinition[];
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly principalUserId?: string;
  readonly roles?: readonly string[];
  readonly allowedToolNames?: readonly string[];
  readonly structuredOutput?: StructuredOutputRequest;
  /** When true, write tools may run without approval (offline certification fakes). */
  readonly allowSideEffectsWithoutApproval?: boolean;
  readonly workerId?: string;
}

export interface ToolContinuationResult {
  readonly providerResult: ProviderExecutionResult;
  readonly orchestration: ToolOrchestrationSummary;
  /** Aggregated usage across model rounds (trustworthy vendor fields only). */
  readonly aggregatedUsage: Readonly<Record<string, number>>;
}

export interface ToolContinuationOrchestratorDeps {
  readonly runtime: IProviderRuntime;
  readonly toolExecutor: ToolExecutor;
  readonly invocationStore: IToolInvocationStore;
  readonly config: ToolExecutionConfig;
  readonly nowIso?: () => string;
}

export class ToolContinuationOrchestrator {
  private readonly nowIso: () => string;

  constructor(private readonly deps: ToolContinuationOrchestratorDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  async execute(input: ToolContinuationRequest): Promise<Result<ToolContinuationResult>> {
    if (!this.deps.config.enabled) {
      return failure(new ValidationError("Tool execution is disabled"));
    }

    if (input.structuredOutput) {
      const schemaOk = validateSchemaDocument(input.structuredOutput.schema);
      if (!schemaOk.ok) return schemaOk;
    }

    // Apply schema instructions + website maxTokens before the first provider call.
    // Without this, Gemini WebsitePage runs as plain chat and truncates mid-CSS.
    const enrichedProviderRequest = input.structuredOutput
      ? withStructuredOutputRequest(input.providerRequest, input.structuredOutput)
      : input.providerRequest;

    const toolDefs = input.tools;
    const openaiTools = toOpenAIToolDefinitions(toolDefs);
    let messages = buildInitialMessages(enrichedProviderRequest.payload);
    let sideEffectExecuted = false;
    let totalRequested = 0;
    let totalExecuted = 0;
    let totalDenied = 0;
    let totalFailures = 0;
    const toolRounds: ToolRoundSummary[] = [];
    const aggregatedUsage: Record<string, number> = {};
    let lastResult: ProviderExecutionResult | undefined;
    let modelRounds = 0;
    let budgetExhausted = false;
    let structuredOutputValid: boolean | undefined;

    for (let round = 0; round < this.deps.config.maxRounds; round++) {
      modelRounds += 1;
      const features = mergeFeatures(
        enrichedProviderRequest,
        input.structuredOutput,
        openaiTools.length > 0
      );
      const payload: Record<string, unknown> = {
        ...enrichedProviderRequest.payload,
        messages,
        ...(openaiTools.length > 0
          ? { tools: openaiTools, tool_choice: "auto" as const }
          : {}),
      };
      if (input.structuredOutput && (openaiTools.length === 0 || round === this.deps.config.maxRounds - 1)) {
        const skipJsonSchema = isGeminiWebsiteHtmlPassthrough(
          enrichedProviderRequest.providerId,
          input.structuredOutput.name
        );
        if (!skipJsonSchema) {
        // Prefer structured immediately when no tools; otherwise on final-ish rounds.
        // OpenAI strict json_schema rejects schemas missing additionalProperties:false /
        // full `required` lists — normalize the same way as structured-output-execution.
        const strict = input.structuredOutput.strict ?? true;
        const schema = strict
          ? normalizeSchemaForOpenAiStrict(
              input.structuredOutput.schema as Record<string, unknown>
            )
          : input.structuredOutput.schema;
        payload.response_format = {
          type: "json_schema",
          json_schema: {
            name: input.structuredOutput.name ?? "response",
            strict,
            schema,
          },
        };
        }
      }

      const req: ProviderExecutionRequest = {
        ...enrichedProviderRequest,
        requestId: `${enrichedProviderRequest.requestId}_r${round}`,
        payload,
        options: {
          ...(enrichedProviderRequest.options ?? {}),
          features,
        },
      };

      const executed = await this.deps.runtime.execute(req);
      if (!executed.ok) return executed;
      lastResult = executed.value;
      accumulateUsage(aggregatedUsage, lastResult.response?.usage);

      if (!lastResult.success) {
        // Provider failure before tools — caller may apply M9.5H failover.
        // After side effects, orchestrator refuses to suggest provider failover.
        return success({
          providerResult: withToolMeta(lastResult, {
            modelRounds,
            toolRounds,
            totalToolCallsRequested: totalRequested,
            totalToolCallsExecuted: totalExecuted,
            totalToolCallsDenied: totalDenied,
            totalToolFailures: totalFailures,
            structuredOutputValid,
            budgetExhausted,
            sideEffectExecuted,
            blockProviderFailover: sideEffectExecuted,
          }),
          orchestration: {
            modelRounds,
            toolRounds,
            totalToolCallsRequested: totalRequested,
            totalToolCallsExecuted: totalExecuted,
            totalToolCallsDenied: totalDenied,
            totalToolFailures: totalFailures,
            structuredOutputValid,
            budgetExhausted,
            sideEffectExecuted,
          },
          aggregatedUsage,
        });
      }

      const output = (lastResult.response?.output ?? {}) as Record<string, unknown>;
      if (!outputHasToolCalls(output)) {
        if (input.structuredOutput) {
          const webCtx = websiteContextFromMetadata(
            enrichedProviderRequest.metadata,
            typeof enrichedProviderRequest.payload.prompt === "string"
              ? enrichedProviderRequest.payload.prompt
              : ""
          );
          const recoverOpts = { preferredStack: webCtx.stack };
          let content = extractContent(output);
          let parsed = parseOrRecoverStructuredOutput(
            content,
            input.structuredOutput,
            recoverOpts
          );
          const truncatedByLength = isProviderOutputTruncated(output);
          if (truncatedByLength && parsed.ok) {
            parsed = {
              ok: false,
              message:
                "Website generation hit the output token limit (truncated).",
            };
          }
          // Invalid/truncated WebProject: one compact rebuild (stack-aware — do not force HTML).
          if (
            !parsed.ok &&
            ["websitepage", "webproject", "websiteroutes"].includes(
              (input.structuredOutput.name ?? "").toLowerCase()
            ) &&
            (looksLikeIncompleteWebProject(content) || truncatedByLength) &&
            enrichedProviderRequest.metadata?.websiteCompletenessRetried !== true
          ) {
            const basePrompt =
              (typeof enrichedProviderRequest.payload.prompt === "string" &&
                enrichedProviderRequest.payload.prompt) ||
              (typeof enrichedProviderRequest.payload.text === "string" &&
                enrichedProviderRequest.payload.text) ||
              "";
            const multiRoute =
              (input.structuredOutput.name ?? "").toLowerCase() ===
              "websiteroutes";
            const stackHint = buildWebProjectInstructionBlock({
              userBrief: webCtx.userBrief || basePrompt,
              brandName: webCtx.brandName,
              exampleDeliverable: webCtx.exampleDeliverable,
              stack: webCtx.stack,
              brandColors: webCtx.brandColors,
              multiRoute,
              isRetry: true,
            });
            const retryPrompt = `${basePrompt}

[COMPLETENESS RETRY] Previous output was truncated or invalid. Emit a MINIMAL complete ${multiRoute ? "WebsiteRoutes" : "WebProject"} JSON now.
stack MUST be "${webCtx.stack}". No markdown fences.

${stackHint}`.trim();
            const retryBase: ProviderExecutionRequest = {
              ...enrichedProviderRequest,
              requestId: `${enrichedProviderRequest.requestId}_webcomplete`,
              metadata: {
                ...(enrichedProviderRequest.metadata ?? {}),
                websiteCompletenessRetried: true,
                preferredWebStack: webCtx.stack,
                webStack: webCtx.stack,
                preferredStack: webCtx.stack,
                ...(webCtx.brandColors.length
                  ? { brandColors: webCtx.brandColors }
                  : {}),
              },
              payload: {
                ...enrichedProviderRequest.payload,
                prompt: retryPrompt,
                text: retryPrompt,
                input: retryPrompt,
              },
            };
            const retryReq = withStructuredOutputRequest(
              retryBase,
              input.structuredOutput
            );
            const reExecuted = await this.deps.runtime.execute({
              ...retryReq,
              requestId: retryBase.requestId,
              options: {
                ...(retryReq.options ?? {}),
                features: mergeFeatures(retryReq, input.structuredOutput, false),
              },
            });
            if (reExecuted.ok && reExecuted.value.success) {
              modelRounds += 1;
              lastResult = reExecuted.value;
              accumulateUsage(aggregatedUsage, lastResult.response?.usage);
              const retryOutput = (lastResult.response?.output ??
                {}) as Record<string, unknown>;
              content = extractContent(retryOutput);
              parsed = parseOrRecoverStructuredOutput(
                content,
                input.structuredOutput,
                recoverOpts
              );
              if (parsed.ok) {
                Object.assign(output, retryOutput);
              }
            }
          }
          structuredOutputValid = parsed.ok;
          if (!parsed.ok) {
            // DocumentPlan: one compact rebuild before failing (mirrors website retry).
            if (
              (input.structuredOutput.name ?? "").toLowerCase() === "documentplan" &&
              enrichedProviderRequest.metadata?.documentPlanRetried !== true
            ) {
              const basePrompt =
                (typeof enrichedProviderRequest.payload.prompt === "string" &&
                  enrichedProviderRequest.payload.prompt) ||
                (typeof enrichedProviderRequest.payload.text === "string" &&
                  enrichedProviderRequest.payload.text) ||
                "";
              const retryPrompt = `${basePrompt}

[DOCUMENT RETRY] Previous output was not valid DocumentPlan JSON.
Emit MINIMAL valid JSON now with keys ONLY: title, summary, sections.
sections must be an array of 5–8 objects {heading, body} with real copy for each.
No markdown fences. No slides, routes, concepts, or steps.
Each body must be at least 2 sentences.`.trim();
              const retryBase: ProviderExecutionRequest = {
                ...enrichedProviderRequest,
                requestId: `${enrichedProviderRequest.requestId}_docretry`,
                metadata: {
                  ...(enrichedProviderRequest.metadata ?? {}),
                  documentPlanRetried: true,
                },
                payload: {
                  ...enrichedProviderRequest.payload,
                  prompt: retryPrompt,
                  text: retryPrompt,
                  input: retryPrompt,
                },
              };
              const retryReq = withStructuredOutputRequest(
                retryBase,
                input.structuredOutput
              );
              const reExecuted = await this.deps.runtime.execute({
                ...retryReq,
                requestId: retryBase.requestId,
                options: {
                  ...(retryReq.options ?? {}),
                  features: mergeFeatures(retryReq, input.structuredOutput, false),
                },
              });
              if (reExecuted.ok && reExecuted.value.success) {
                modelRounds += 1;
                lastResult = reExecuted.value;
                accumulateUsage(aggregatedUsage, lastResult.response?.usage);
                const retryOutput = (lastResult.response?.output ??
                  {}) as Record<string, unknown>;
                content = extractContent(retryOutput);
                if (
                  retryOutput.structured != null &&
                  typeof retryOutput.structured === "object"
                ) {
                  parsed = parseOrRecoverStructuredOutput(
                    JSON.stringify(retryOutput.structured),
                    input.structuredOutput
                  );
                } else {
                  parsed = parseOrRecoverStructuredOutput(
                    content,
                    input.structuredOutput
                  );
                }
                if (parsed.ok) {
                  Object.assign(output, retryOutput);
                }
              }
            }
          }
          structuredOutputValid = parsed.ok;
          if (!parsed.ok) {
            return success({
              providerResult: withToolMeta(
                {
                  ...lastResult,
                  success: false,
                  status: "failed",
                  error: {
                    code: "STRUCTURED_OUTPUT_INVALID",
                    message: parsed.message,
                  },
                },
                {
                  modelRounds,
                  toolRounds,
                  totalToolCallsRequested: totalRequested,
                  totalToolCallsExecuted: totalExecuted,
                  totalToolCallsDenied: totalDenied,
                  totalToolFailures: totalFailures,
                  structuredOutputValid: false,
                  budgetExhausted,
                  sideEffectExecuted,
                  blockProviderFailover: sideEffectExecuted,
                }
              ),
              orchestration: {
                modelRounds,
                toolRounds,
                totalToolCallsRequested: totalRequested,
                totalToolCallsExecuted: totalExecuted,
                totalToolCallsDenied: totalDenied,
                totalToolFailures: totalFailures,
                structuredOutputValid: false,
                budgetExhausted,
                sideEffectExecuted,
              },
              aggregatedUsage,
            });
          }
          // Attach parsed structured output without leaking raw vendor shape.
          lastResult = {
            ...lastResult,
            response: lastResult.response
              ? {
                  ...lastResult.response,
                  output: Object.freeze({
                    ...output,
                    structured: parsed.value,
                    content,
                    structuredOutputValid: true,
                  }),
                }
              : lastResult.response,
          };

          if (
            input.structuredOutput &&
            shouldRunStructuredOutputGate(
              input.structuredOutput,
              enrichedProviderRequest.metadata
            )
          ) {
            const gated = await attachStructuredOutputWithPresentationGate({
              executed: lastResult,
              structured: input.structuredOutput,
              providerRequest: enrichedProviderRequest,
              nowIso: this.nowIso,
              reExecute: async (request) => {
                // Prefer schema stamped on the request (e.g. PresentationRoutes
                // expansion) over the outer concepts schema.
                const rf = request.payload?.response_format as
                  | {
                      type?: string;
                      json_schema?: {
                        name?: string;
                        schema?: Record<string, unknown>;
                        strict?: boolean;
                      };
                    }
                  | undefined;
                const expandStructured =
                  rf?.type === "json_schema" &&
                  rf.json_schema?.schema &&
                  typeof rf.json_schema.schema === "object"
                    ? {
                        name: rf.json_schema.name,
                        schema: rf.json_schema.schema,
                        strict: rf.json_schema.strict ?? true,
                      }
                    : input.structuredOutput;
                return this.deps.runtime.execute({
                  ...request,
                  options: {
                    ...(request.options ?? {}),
                    features: mergeFeatures(request, expandStructured, false),
                  },
                });
              },
            });
            if (!gated.ok) return gated;
            lastResult = gated.value;
            const gatedOutput = (lastResult.response?.output ?? {}) as Record<
              string,
              unknown
            >;
            structuredOutputValid =
              gatedOutput.structuredOutputValid !== false &&
              gatedOutput.structured != null;
          }
        }

        return success({
          providerResult: withToolMeta(lastResult, {
            modelRounds,
            toolRounds,
            totalToolCallsRequested: totalRequested,
            totalToolCallsExecuted: totalExecuted,
            totalToolCallsDenied: totalDenied,
            totalToolFailures: totalFailures,
            structuredOutputValid,
            budgetExhausted,
            sideEffectExecuted,
            blockProviderFailover: sideEffectExecuted,
          }),
          orchestration: {
            modelRounds,
            toolRounds,
            totalToolCallsRequested: totalRequested,
            totalToolCallsExecuted: totalExecuted,
            totalToolCallsDenied: totalDenied,
            totalToolFailures: totalFailures,
            structuredOutputValid,
            budgetExhausted,
            sideEffectExecuted,
          },
          aggregatedUsage,
        });
      }

      const calls = normalizeOpenAIToolCalls(output).slice(
        0,
        this.deps.config.maxCallsPerRound
      );
      if (totalRequested + calls.length > this.deps.config.maxCallsPerExecution) {
        budgetExhausted = true;
        break;
      }
      totalRequested += calls.length;

      // Deterministic sequential execution — never blind-parallelize side effects.
      const results: ToolExecutionResult[] = [];
      let denied = 0;
      let executedCount = 0;
      let failures = 0;
      for (const call of calls) {
        const toolResult = await this.deps.toolExecutor.execute(call, {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          principalUserId: input.principalUserId,
          roles: input.roles,
          executionId: String(input.providerRequest.context.executionId),
          round,
          workerId: input.workerId ?? "tool-orchestrator",
          allowedToolNames: input.allowedToolNames ?? toolDefs.map((t) => t.name),
          requireApprovalForSideEffects: input.allowSideEffectsWithoutApproval
            ? false
            : this.deps.config.requireApprovalForSideEffects,
        });
        if (!toolResult.ok) return toolResult;
        const r = toolResult.value;
        results.push(r);
        if (r.status === "denied" || r.status === "awaiting_approval") denied += 1;
        else if (r.status === "succeeded" || r.status === "skipped_idempotent") {
          executedCount += 1;
          const def = toolDefs.find((t) => t.name === r.toolName);
          if (def && def.riskClass !== "read_only") sideEffectExecuted = true;
        } else {
          failures += 1;
        }
        // Approval-required stops the loop without executing further tools in-round after deny policy.
        if (r.status === "awaiting_approval") {
          totalDenied += denied;
          totalExecuted += executedCount;
          totalFailures += failures;
          toolRounds.push({
            round,
            toolCallsRequested: calls.length,
            toolCallsExecuted: executedCount,
            toolCallsDenied: denied,
            toolFailures: failures,
            results,
          });
          const checkpoint = {
            messages,
            providerId: String(input.providerRequest.providerId),
            modelId: String(input.providerRequest.modelId ?? ""),
            capabilityId: String(input.providerRequest.capabilityId),
            prompt: extractPrompt(input.providerRequest.payload),
            toolNames: toolDefs.map((t) => t.name),
            structuredOutput: input.structuredOutput as Record<string, unknown> | undefined,
            allowSideEffectsWithoutApproval: input.allowSideEffectsWithoutApproval,
            aggregatedUsage,
            modelRounds,
            assistantToolCalls: (output.tool_calls as unknown[]) ?? [],
            pendingToolCall: {
              id: call.id,
              name: call.name,
              arguments: call.arguments,
            },
            phase: "awaiting_approval" as const,
            roles: input.roles,
            principalUserId: input.principalUserId,
            workspaceId: input.workspaceId,
            requestId: input.providerRequest.requestId,
          };
          if (r.invocationKey) {
            await this.deps.invocationStore.updateCheckpoint(
              r.invocationKey,
              checkpoint,
              this.nowIso()
            );
          }
          return success({
            providerResult: {
              ...lastResult,
              success: false,
              status: "failed",
              error: {
                code: "TOOL_APPROVAL_REQUIRED",
                message: r.error?.message ?? "Tool requires approval",
              },
              // Invocation key is held in the server-side orchestration store.
            },
            orchestration: {
              modelRounds,
              toolRounds,
              totalToolCallsRequested: totalRequested,
              totalToolCallsExecuted: totalExecuted,
              totalToolCallsDenied: totalDenied,
              totalToolFailures: totalFailures,
              structuredOutputValid,
              budgetExhausted,
              sideEffectExecuted,
            },
            aggregatedUsage,
          });
        }
      }

      totalDenied += denied;
      totalExecuted += executedCount;
      totalFailures += failures;
      toolRounds.push({
        round,
        toolCallsRequested: calls.length,
        toolCallsExecuted: executedCount,
        toolCallsDenied: denied,
        toolFailures: failures,
        results,
      });

      messages = [
        ...buildContinuationMessages({
          priorMessages: messages,
          assistantToolCalls: (output.tool_calls as unknown[]) ?? [],
          results,
        }),
      ];

      if (round + 1 >= this.deps.config.maxRounds) {
        budgetExhausted = true;
      }
    }

    budgetExhausted = true;
    return success({
      providerResult: withToolMeta(
        lastResult ?? {
          requestId: input.providerRequest.requestId,
          sessionId: "none",
          status: "failed",
          success: false,
          error: { code: "TOOL_BUDGET_EXHAUSTED", message: "Tool loop budget exhausted" },
          statistics: {
            queueWaitMs: 0,
            dispatchMs: 0,
            executionMs: 0,
            streamingMs: 0,
            totalMs: 0,
            attempts: modelRounds,
            retries: 0,
            timeouts: 0,
            streamingChunks: 0,
          },
          completedAt: this.nowIso(),
        },
        {
          modelRounds,
          toolRounds,
          totalToolCallsRequested: totalRequested,
          totalToolCallsExecuted: totalExecuted,
          totalToolCallsDenied: totalDenied,
          totalToolFailures: totalFailures,
          structuredOutputValid,
          budgetExhausted: true,
          sideEffectExecuted,
          blockProviderFailover: sideEffectExecuted,
        }
      ),
      orchestration: {
        modelRounds,
        toolRounds,
        totalToolCallsRequested: totalRequested,
        totalToolCallsExecuted: totalExecuted,
        totalToolCallsDenied: totalDenied,
        totalToolFailures: totalFailures,
        structuredOutputValid,
        budgetExhausted: true,
        sideEffectExecuted,
      },
      aggregatedUsage,
    });
  }

  /**
   * Resume after durable approval (or after tool result persisted, before continuation).
   * Does not re-ask the provider to regenerate the tool call.
   */
  async resumeAfterApproval(input: {
    readonly invocationKey: string;
    readonly workerId: string;
    readonly tools: readonly ToolDefinition[];
    readonly organizationId: string;
  }): Promise<Result<ToolContinuationResult>> {
    const existing = await this.deps.invocationStore.get(input.invocationKey);
    if (!existing || existing.organizationId !== input.organizationId) {
      return failure(new ValidationError("Tool invocation not found"));
    }
    if (existing.approval?.decision === "reject") {
      return success({
        providerResult: {
          requestId: existing.checkpoint?.requestId ?? existing.executionId,
          sessionId: "none",
          status: "failed",
          success: false,
          error: {
            code: "TOOL_APPROVAL_REJECTED",
            message: "Tool approval rejected — handler never executed",
          },
          statistics: {
            queueWaitMs: 0,
            dispatchMs: 0,
            executionMs: 0,
            streamingMs: 0,
            totalMs: 0,
            attempts: 0,
            retries: 0,
            timeouts: 0,
            streamingChunks: 0,
          },
          completedAt: this.nowIso(),
        },
        orchestration: {
          modelRounds: existing.checkpoint?.modelRounds ?? 0,
          toolRounds: [],
          totalToolCallsRequested: 1,
          totalToolCallsExecuted: 0,
          totalToolCallsDenied: 1,
          totalToolFailures: 0,
          budgetExhausted: false,
          sideEffectExecuted: false,
        },
        aggregatedUsage: { ...(existing.checkpoint?.aggregatedUsage ?? {}) },
      });
    }

    const checkpoint = existing.checkpoint;
    if (!checkpoint?.pendingToolCall && !existing.result) {
      return failure(new ValidationError("Missing continuation checkpoint"));
    }

    let toolResult = existing.result;
    let sideEffectExecuted = false;
    const aggregatedUsage: Record<string, number> = {
      ...(checkpoint?.aggregatedUsage ?? {}),
    };
    let modelRounds = checkpoint?.modelRounds ?? 1;

    if (!toolResult) {
      if (existing.approval?.decision !== "approve") {
        return failure(new ValidationError("Invocation is not approved"));
      }
      const claim = await this.deps.invocationStore.tryClaimApproved({
        invocationKey: input.invocationKey,
        workerId: input.workerId,
        nowIso: this.nowIso(),
      });
      if (!claim.claimed) {
        if (claim.record?.result) {
          toolResult = claim.record.result;
        } else {
          return failure(new ValidationError("Could not claim approved invocation"));
        }
      } else {
        const pending = checkpoint!.pendingToolCall!;
        const executed = await this.deps.toolExecutor.execute(
          {
            id: pending.id,
            name: pending.name,
            arguments: pending.arguments,
          },
          {
            organizationId: input.organizationId,
            workspaceId: checkpoint?.workspaceId,
            principalUserId: checkpoint?.principalUserId,
            roles: checkpoint?.roles,
            executionId: existing.executionId,
            round: existing.round,
            workerId: input.workerId,
            allowedToolNames: checkpoint?.toolNames ?? input.tools.map((t) => t.name),
            requireApprovalForSideEffects: false,
          }
        );
        if (!executed.ok) return executed;
        toolResult = executed.value;
        if (toolResult.status === "denied") {
          return success({
            providerResult: {
              requestId: checkpoint?.requestId ?? existing.executionId,
              sessionId: "none",
              status: "failed",
              success: false,
              error: {
                code: "TOOL_UNAUTHORIZED",
                message: toolResult.error?.message ?? "Authorization denied after approval",
              },
              statistics: {
                queueWaitMs: 0,
                dispatchMs: 0,
                executionMs: 0,
                streamingMs: 0,
                totalMs: 0,
                attempts: 0,
                retries: 0,
                timeouts: 0,
                streamingChunks: 0,
              },
              completedAt: this.nowIso(),
            },
            orchestration: {
              modelRounds,
              toolRounds: [
                {
                  round: existing.round,
                  toolCallsRequested: 1,
                  toolCallsExecuted: 0,
                  toolCallsDenied: 1,
                  toolFailures: 0,
                  results: [toolResult],
                },
              ],
              totalToolCallsRequested: 1,
              totalToolCallsExecuted: 0,
              totalToolCallsDenied: 1,
              totalToolFailures: 0,
              budgetExhausted: false,
              sideEffectExecuted: false,
            },
            aggregatedUsage,
          });
        }
      }
    }

    if (
      toolResult &&
      (toolResult.status === "succeeded" || toolResult.status === "skipped_idempotent")
    ) {
      const def = input.tools.find((t) => t.name === toolResult!.toolName);
      if (def && def.riskClass !== "read_only") sideEffectExecuted = true;
    }

    // Mark continuation phase so restart does not re-run the tool.
    await this.deps.invocationStore.updateCheckpoint(
      input.invocationKey,
      {
        ...(checkpoint ?? {
          messages: [],
          providerId: "provider.openai",
          modelId: "",
          capabilityId: "text.generate",
          prompt: "",
          toolNames: input.tools.map((t) => t.name),
        }),
        phase: "awaiting_continuation",
        aggregatedUsage,
        modelRounds,
      },
      this.nowIso()
    );

    const messages = [
      ...buildContinuationMessages({
        priorMessages: [...(checkpoint?.messages ?? [])],
        assistantToolCalls: checkpoint?.assistantToolCalls ?? [],
        results: [toolResult!],
      }),
    ];

    const structuredOutput = checkpoint?.structuredOutput as StructuredOutputRequest | undefined;
    const openaiTools = toOpenAIToolDefinitions(input.tools);
    let lastResult: ProviderExecutionResult | undefined;
    let structuredOutputValid: boolean | undefined;
    let budgetExhausted = false;
    const toolRounds: ToolRoundSummary[] = [
      {
        round: existing.round,
        toolCallsRequested: 1,
        toolCallsExecuted:
          toolResult?.status === "succeeded" || toolResult?.status === "skipped_idempotent"
            ? 1
            : 0,
        toolCallsDenied: toolResult?.status === "denied" ? 1 : 0,
        toolFailures:
          toolResult?.status === "failed" || toolResult?.status === "timeout" ? 1 : 0,
        results: toolResult ? [toolResult] : [],
      },
    ];

    // Continuation model rounds only — never regenerate the approved tool call.
    for (let round = existing.round + 1; round < this.deps.config.maxRounds; round++) {
      modelRounds += 1;
      const features = mergeFeatures(
        {
          requestId: checkpoint?.requestId ?? existing.executionId,
          providerId: checkpoint?.providerId as never,
          capabilityId: checkpoint?.capabilityId as never,
          modelId: checkpoint?.modelId,
          payload: {},
          context: {} as never,
          retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
          timeoutPolicy: { executionTimeoutMs: 30_000 },
          streaming: false,
          priority: 0,
          createdAt: this.nowIso(),
        } as ProviderExecutionRequest,
        structuredOutput,
        openaiTools.length > 0
      );
      const payload: Record<string, unknown> = {
        messages,
        ...(openaiTools.length > 0
          ? { tools: openaiTools, tool_choice: "none" as const }
          : {}),
        prompt: checkpoint?.prompt,
      };
      if (structuredOutput) {
        const strict = structuredOutput.strict ?? true;
        const schema = strict
          ? normalizeSchemaForOpenAiStrict(
              structuredOutput.schema as Record<string, unknown>
            )
          : structuredOutput.schema;
        payload.response_format = {
          type: "json_schema",
          json_schema: {
            name: structuredOutput.name ?? "response",
            strict,
            schema,
          },
        };
      }

      const req: ProviderExecutionRequest = {
        requestId: `${checkpoint?.requestId ?? existing.executionId}_resume_r${round}`,
        providerId: asProviderId(checkpoint?.providerId ?? "provider.openai"),
        capabilityId: asCapabilityId(checkpoint?.capabilityId ?? "text.generate"),
        modelId: checkpoint?.modelId,
        payload,
        options: { features },
        context: {
          requestId: `${checkpoint?.requestId ?? existing.executionId}_resume_r${round}`,
          providerId: asProviderId(checkpoint?.providerId ?? "provider.openai"),
          organizationId: asOrganizationId(input.organizationId),
          workspaceId: asWorkspaceId(checkpoint?.workspaceId ?? "ws_default"),
          executionId: asExecutionId(existing.executionId),
          correlationId: existing.executionId,
          createdAt: this.nowIso(),
        } as never,
        retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
        timeoutPolicy: { executionTimeoutMs: 30_000 },
        streaming: false,
        priority: 0,
        createdAt: this.nowIso(),
      };

      const executed = await this.deps.runtime.execute(req);
      if (!executed.ok) return executed;
      lastResult = executed.value;
      accumulateUsage(aggregatedUsage, lastResult.response?.usage);

      if (!lastResult.success) {
        return success({
          providerResult: withToolMeta(lastResult, {
            modelRounds,
            toolRounds,
            sideEffectExecuted,
            blockProviderFailover: sideEffectExecuted,
          }),
          orchestration: {
            modelRounds,
            toolRounds,
            totalToolCallsRequested: 1,
            totalToolCallsExecuted: toolRounds[0]?.toolCallsExecuted ?? 0,
            totalToolCallsDenied: toolRounds[0]?.toolCallsDenied ?? 0,
            totalToolFailures: toolRounds[0]?.toolFailures ?? 0,
            structuredOutputValid,
            budgetExhausted,
            sideEffectExecuted,
          },
          aggregatedUsage,
        });
      }

      const output = (lastResult.response?.output ?? {}) as Record<string, unknown>;
      if (outputHasToolCalls(output)) {
        // Refuse regenerating tool calls on continuation after side-effect/approval resume.
        return success({
          providerResult: {
            ...lastResult,
            success: false,
            status: "failed",
            error: {
              code: "TOOL_CONTINUATION_REFUSED",
              message:
                "Provider requested tools during approval resume continuation — refused for safety",
            },
          },
          orchestration: {
            modelRounds,
            toolRounds,
            totalToolCallsRequested: 1,
            totalToolCallsExecuted: toolRounds[0]?.toolCallsExecuted ?? 0,
            totalToolCallsDenied: 0,
            totalToolFailures: 0,
            structuredOutputValid,
            budgetExhausted,
            sideEffectExecuted,
          },
          aggregatedUsage,
        });
      }

      if (structuredOutput) {
        const content = extractContent(output);
        const parsed = parseOrRecoverStructuredOutput(content, structuredOutput);
        structuredOutputValid = parsed.ok;
        if (!parsed.ok) {
          return success({
            providerResult: {
              ...lastResult,
              success: false,
              status: "failed",
              error: {
                code: "STRUCTURED_OUTPUT_INVALID",
                message: parsed.message,
              },
            },
            orchestration: {
              modelRounds,
              toolRounds,
              totalToolCallsRequested: 1,
              totalToolCallsExecuted: toolRounds[0]?.toolCallsExecuted ?? 0,
              totalToolCallsDenied: 0,
              totalToolFailures: 0,
              structuredOutputValid: false,
              budgetExhausted,
              sideEffectExecuted,
            },
            aggregatedUsage,
          });
        }
        lastResult = {
          ...lastResult,
          response: lastResult.response
            ? {
                ...lastResult.response,
                output: Object.freeze({
                  ...output,
                  structured: parsed.value,
                  content,
                }),
              }
            : lastResult.response,
        };
      }

      return success({
        providerResult: withToolMeta(lastResult, {
          modelRounds,
          toolRounds,
          sideEffectExecuted,
          blockProviderFailover: sideEffectExecuted,
        }),
        orchestration: {
          modelRounds,
          toolRounds,
          totalToolCallsRequested: 1,
          totalToolCallsExecuted: toolRounds[0]?.toolCallsExecuted ?? 0,
          totalToolCallsDenied: toolRounds[0]?.toolCallsDenied ?? 0,
          totalToolFailures: toolRounds[0]?.toolFailures ?? 0,
          structuredOutputValid,
          budgetExhausted,
          sideEffectExecuted,
        },
        aggregatedUsage,
      });
    }

    budgetExhausted = true;
    return success({
      providerResult: withToolMeta(
        lastResult ?? {
          requestId: existing.executionId,
          sessionId: "none",
          status: "failed",
          success: false,
          error: { code: "TOOL_BUDGET_EXHAUSTED", message: "Resume budget exhausted" },
          statistics: {
            queueWaitMs: 0,
            dispatchMs: 0,
            executionMs: 0,
            streamingMs: 0,
            totalMs: 0,
            attempts: modelRounds,
            retries: 0,
            timeouts: 0,
            streamingChunks: 0,
          },
          completedAt: this.nowIso(),
        },
        { modelRounds, toolRounds, sideEffectExecuted, blockProviderFailover: sideEffectExecuted }
      ),
      orchestration: {
        modelRounds,
        toolRounds,
        totalToolCallsRequested: 1,
        totalToolCallsExecuted: toolRounds[0]?.toolCallsExecuted ?? 0,
        totalToolCallsDenied: 0,
        totalToolFailures: 0,
        structuredOutputValid,
        budgetExhausted: true,
        sideEffectExecuted,
      },
      aggregatedUsage,
    });
  }
}

function extractPrompt(payload: Readonly<Record<string, unknown>>): string {
  if (typeof payload.prompt === "string") return payload.prompt;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.input === "string") return payload.input;
  return "";
}

function buildInitialMessages(
  payload: Readonly<Record<string, unknown>>
): Record<string, unknown>[] {
  if (Array.isArray(payload.messages)) {
    return [...(payload.messages as Record<string, unknown>[])];
  }
  const text =
    (typeof payload.prompt === "string" && payload.prompt) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.input === "string" && payload.input) ||
    "";
  return [{ role: "user", content: text }];
}

function mergeFeatures(
  request: ProviderExecutionRequest,
  structured?: StructuredOutputRequest,
  hasTools = false
): string[] {
  const fromOptions = Array.isArray((request.options as Record<string, unknown> | undefined)?.features)
    ? ([...(request.options as Record<string, unknown>).features as string[]])
    : [];
  const set = new Set(fromOptions);
  // Only request tool features when real server tools are attached — structured-only
  // flows (pitch decks, documents) use json_schema / forced tool_use instead.
  if (hasTools) {
    set.add("functions");
    set.add("tools");
  }
  if (
    structured &&
    !isGeminiWebsiteHtmlPassthrough(request.providerId, structured.name)
  ) {
    // Canonical adapter features (capabilityFeatures) — not OpenAI-only aliases.
    set.add("json_mode");
    set.add("response_format");
  }
  return sanitizeExecutionFeatures([...set]);
}

function extractContent(output: Record<string, unknown>): string {
  // Prefer structured object first — Anthropic tool_use may set both, and
  // empty/whitespace content must not hide a valid structured payload.
  if (output.structured != null && typeof output.structured === "object") {
    return JSON.stringify(output.structured);
  }
  if (typeof output.content === "string" && output.content.trim()) {
    return coerceJsonText(output.content);
  }
  if (output.content != null && typeof output.content !== "string") {
    return coerceJsonText(JSON.stringify(output.content));
  }
  if (typeof output.text === "string" && output.text.trim()) {
    return coerceJsonText(output.text);
  }
  return "";
}

function looksLikeIncompleteWebProject(content: string): boolean {
  const hay = content.trim();
  if (!hay) return true;
  // Truncated HTML document
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(hay) && !/<\/html>/i.test(hay)) {
    return true;
  }
  // Truncated / broken WebProject JSON (React/Next/MERN or html-static)
  if (hay.startsWith("{") || /"files"\s*:/.test(hay) || /"stack"\s*:/.test(hay)) {
    try {
      JSON.parse(hay);
      return true; // parsed but recover still failed upstream
    } catch {
      return true; // truncated JSON
    }
  }
  return true;
}

function accumulateUsage(
  acc: Record<string, number>,
  usage: Readonly<Record<string, unknown>> | undefined
): void {
  if (!usage) return;
  for (const [k, v] of Object.entries(usage)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      acc[k] = (acc[k] ?? 0) + v;
    }
  }
}

function withToolMeta(
  result: ProviderExecutionResult,
  meta: Record<string, unknown>
): ProviderExecutionResult {
  const output = {
    ...((result.response?.output as Record<string, unknown>) ?? {}),
    toolOrchestration: meta,
  };
  return {
    ...result,
    response: {
      requestId: result.response?.requestId ?? result.requestId,
      providerId: result.response?.providerId ?? (result.finalProviderId as never) ?? ("" as never),
      output: Object.freeze(output),
      usage: result.response?.usage,
      streamed: result.response?.streamed ?? false,
      finishedAt: result.response?.finishedAt ?? result.completedAt,
    },
  };
}

function shouldRunStructuredOutputGate(
  structured: StructuredOutputRequest,
  metadata?: Readonly<Record<string, unknown>>
): boolean {
  const name = (structured.name ?? "").toLowerCase();
  if (
    name === "presentationrouteconcepts" ||
    name === "presentationroutes" ||
    name === "presentationplan" ||
    name === "websitepage" ||
    name === "webproject"
  ) {
    return true;
  }
  const outputKind = String(metadata?.outputKind ?? "").toLowerCase();
  const service = String(metadata?.service ?? "").toLowerCase();
  const subtype = String(metadata?.subtype ?? "").toLowerCase();
  if (outputKind === "presentation" || service === "presentations") {
    return subtype !== "gifs";
  }
  return false;
}
