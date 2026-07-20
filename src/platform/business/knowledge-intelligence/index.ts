/**
 * Organizational Knowledge Intelligence.
 *
 * Semantic graph over Brand Brain. Structured context only.
 * Does not redesign Brand Brain or Intelligence OS.
 * Does not generate prompts or execute AI.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./ontology";
export { KnowledgeIntelligenceEngine } from "./engine/knowledge-intelligence-engine";
export { projectBrandBrainToGraph } from "./graph/brand-brain-projector";
export {
  relatedVia,
  shortestPath,
  neighborhood,
} from "./reasoning/traverse";
export {
  assembleKnowledgeContext,
  contextToExecutionMetadata,
} from "./context/assemble-context";
export {
  KnowledgeSyncBuilder,
  KnowledgeRetrievalBuilder,
} from "./builders/knowledge-builders";
export {
  createKnowledgeIntelligencePlatform,
  type KnowledgeIntelligencePlatform,
  type CreateKnowledgeIntelligenceOptions,
} from "./factories/create-knowledge-intelligence-platform";
