/**
 * Production execution intelligence context pipeline.
 * Replaces demo/sample context builders in Integration OS runtime.
 */

import { createContextIntelligenceEngine } from "../../context/factories/create-context-engine";
import { createKnowledgeIntelligenceEngine } from "../../knowledge/factories/create-knowledge-engine";
import { KnowledgeRequestBuilder } from "../../knowledge/builders/knowledge-builders";
import { createPromptCompiler } from "../../prompt-compiler/factories/create-prompt-compiler";
import { ExecutionIntelligenceRequestBuilder } from "../../execution-intelligence/builders/execution-intelligence-request-builder";
import { asCapabilityId } from "../../shared/identifiers";
import type { ExecutionIntelligenceRequest } from "../../execution-intelligence/contracts/request";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type {
  ExecutionContextResolver,
  ResolvedExecutionContextBundle,
} from "../../../business/execution-context";
import { mergeBusinessKnowledgeIntoSnapshot } from "../../../business/execution-context";
import { integrationRequestToContextInput } from "./integration-request-mapper";

export interface ExecutionIntelligenceContextPipelineDeps {
  readonly resolver: ExecutionContextResolver;
  readonly nowIso?: () => string;
}

export interface ExecutionIntelligenceContextResult {
  readonly request: ExecutionIntelligenceRequest;
  readonly contextBundle: ResolvedExecutionContextBundle;
  readonly promptCompilationId?: string;
}

export async function buildExecutionIntelligenceContext(input: {
  requestId: string;
  integrationRequest: IntelligenceOsIntegrationRequest;
  bag: IntegrationArtifactBag;
  deps: ExecutionIntelligenceContextPipelineDeps;
}): Promise<ExecutionIntelligenceContextResult> {
  const taskReport = input.bag.task!;
  const governanceReport = input.bag.governance!;
  const nowIso = input.deps.nowIso ?? (() => new Date().toISOString());

  const resolveInput = integrationRequestToContextInput({
    request: input.integrationRequest,
    taskReport,
  });

  const resolved = await input.deps.resolver.resolve(resolveInput);
  if (!resolved.ok) {
    throw resolved.error;
  }

  const bundle = resolved.value;
  const contextEngine = createContextIntelligenceEngine();
  const useProductChunks =
    process.env.ENTERPRISE_API_EXECUTION_MODE === "live" ||
    process.env.INTELLIGENCE_KNOWLEDGE_PRODUCT_CHUNKS === "true";
  const knowledgeEngine = createKnowledgeIntelligenceEngine({
    enableCache: false,
    useProductChunks,
  });
  const compiler = createPromptCompiler();

  const context = await contextEngine.build({
    ...bundle.contextBuildRequest,
    inputHints: {
      ...bundle.contextBuildRequest.inputHints,
      message: taskReport.request.rawPrompt,
      task: taskReport.request.rawPrompt,
    },
  });
  if (!context.ok) throw context.error;

  const knowledgeRequest = KnowledgeRequestBuilder.fromIntelligenceContext(
    context.value,
    taskReport.request.rawPrompt
  ).build();
  const knowledgeBase = await knowledgeEngine.snapshot(knowledgeRequest);
  if (!knowledgeBase.ok) throw knowledgeBase.error;

  const knowledge = mergeBusinessKnowledgeIntoSnapshot({
    base: knowledgeBase.value,
    businessKnowledge: bundle.businessKnowledge,
    brandEnrichment: bundle.brandEnrichment,
    nowIso,
  });

  const compiled = await compiler.compile({
    templateId: "default.capability",
    templateVersion: "1.0.0",
    context: context.value,
    knowledge,
    variables: { "user.input": JSON.stringify({ message: taskReport.request.rawPrompt }) },
  });
  if (!compiled.ok) throw compiled.error;

  const capabilityId = input.bag.capability?.executionPlan.capabilityIds[0]
    ? asCapabilityId(input.bag.capability.executionPlan.capabilityIds[0])
    : asCapabilityId(String(taskReport.capabilityMap.primary));

  const executionRequest = ExecutionIntelligenceRequestBuilder.create()
    .withRequestId(`${input.requestId}_ei`)
    .withCapabilityId(capabilityId)
    .withContext(context.value)
    .withKnowledge(knowledge)
    .withCompiledPrompt(compiled.value.compiled)
    .withPreferences({
      maxTokenBudget: governanceReport.request.tokenBudgetLimit ?? 500000,
      prioritizeQuality: true,
      enableReasoning: taskReport.complexityProfile.tier !== "simple",
    })
    .withAttributes({
      governanceDecision: governanceReport.governanceExecutionPlan.decision.kind,
      capabilityPlanId: input.bag.capability?.executionPlan.planId,
      experiencePackageId: input.bag.experienceInjection?.package.packageId,
      contextSnapshotId: bundle.trace.contextSnapshotId,
      brandEnrichmentId: bundle.trace.brandSnapshotId,
      brandBrainVersion: bundle.trace.brandBrainVersion,
      knowledgeSnapshotId: bundle.trace.knowledgeSnapshotId,
      promptCompilationId: compiled.value.compiled.compilationId,
      promptVersion: compiled.value.compiled.templateVersion,
    })
    .build();

  return {
    request: executionRequest,
    contextBundle: bundle,
    promptCompilationId: compiled.value.compiled.compilationId,
  };
}
