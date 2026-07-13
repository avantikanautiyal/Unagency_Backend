import { createContextIntelligenceEngine } from "../../context/factories/create-context-engine";
import { sampleContextBuildRequest } from "../../context/testing";
import { createKnowledgeIntelligenceEngine } from "../../knowledge/factories/create-knowledge-engine";
import { KnowledgeRequestBuilder } from "../../knowledge/builders/knowledge-builders";
import type { PromptCompilationRequest } from "../contracts/prompt-models";

export async function sampleCompilationRequest(): Promise<PromptCompilationRequest> {
  const contextEngine = createContextIntelligenceEngine();
  const knowledgeEngine = createKnowledgeIntelligenceEngine({
    enableCache: false,
  });

  const context = await contextEngine.build(sampleContextBuildRequest());
  if (!context.ok) {
    throw context.error;
  }

  const knowledgeRequest = KnowledgeRequestBuilder.fromIntelligenceContext(
    context.value,
    "brand"
  ).build();
  const knowledge = await knowledgeEngine.snapshot(knowledgeRequest);
  if (!knowledge.ok) {
    throw knowledge.error;
  }

  return {
    templateId: "default.capability",
    templateVersion: "1.0.0",
    context: context.value,
    knowledge: knowledge.value,
    variables: {
      "user.input": JSON.stringify({ message: "Hello" }),
    },
  };
}
