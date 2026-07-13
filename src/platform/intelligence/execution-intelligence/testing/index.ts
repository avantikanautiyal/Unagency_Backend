/**
 * Execution Intelligence testing utilities.
 */

import { createContextIntelligenceEngine } from "../../context/factories/create-context-engine";
import { sampleContextBuildRequest } from "../../context/testing";
import { createKnowledgeIntelligenceEngine } from "../../knowledge/factories/create-knowledge-engine";
import { KnowledgeRequestBuilder } from "../../knowledge/builders/knowledge-builders";
import { createPromptCompiler } from "../../prompt-compiler/factories/create-prompt-compiler";
import { asCapabilityId } from "../../shared/identifiers";
import type { ExecutionStrategyKind } from "../contracts/enums";
import type { ExecutionIntelligenceRequest } from "../contracts/request";
import { ExecutionIntelligenceRequestBuilder } from "../builders/execution-intelligence-request-builder";
import {
  createExecutionIntelligencePlatform,
  type CreateExecutionIntelligencePlatformOptions,
  type ExecutionIntelligencePlatform,
} from "../factories/create-execution-intelligence-platform";

export async function sampleExecutionIntelligenceRequest(
  overrides?: Partial<{
    requestId: string;
    strategy: ExecutionStrategyKind;
    enableVerification: boolean;
    enableReasoning: boolean;
    maxTokenBudget: number;
  }>
): Promise<ExecutionIntelligenceRequest> {
  const contextEngine = createContextIntelligenceEngine();
  const knowledgeEngine = createKnowledgeIntelligenceEngine({ enableCache: false });
  const compiler = createPromptCompiler();

  const context = await contextEngine.build(sampleContextBuildRequest());
  if (!context.ok) throw context.error;

  const knowledgeRequest = KnowledgeRequestBuilder.fromIntelligenceContext(
    context.value,
    "brand"
  ).build();
  const knowledge = await knowledgeEngine.snapshot(knowledgeRequest);
  if (!knowledge.ok) throw knowledge.error;

  const compiled = await compiler.compile({
    templateId: "default.capability",
    templateVersion: "1.0.0",
    context: context.value,
    knowledge: knowledge.value,
    variables: { "user.input": JSON.stringify({ message: "Hello" }) },
  });
  if (!compiled.ok) throw compiled.error;

  return ExecutionIntelligenceRequestBuilder.create()
    .withRequestId(overrides?.requestId ?? "exec_intel_req_1")
    .withCapabilityId(asCapabilityId("echo"))
    .withContext(context.value)
    .withKnowledge(knowledge.value)
    .withCompiledPrompt(compiled.value.compiled)
    .withPreferences({
      preferredStrategy: overrides?.strategy,
      enableVerification: overrides?.enableVerification,
      enableReasoning: overrides?.enableReasoning,
      maxTokenBudget: overrides?.maxTokenBudget,
    })
    .build();
}

export function deterministicHelpers() {
  let idCounter = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupExecutionIntelligencePlatform(
  options: CreateExecutionIntelligencePlatformOptions = {}
): ExecutionIntelligencePlatform {
  const helpers = deterministicHelpers();
  return createExecutionIntelligencePlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
