/**
 * Brand Brain & Organizational Intelligence.
 *
 * Proprietary enrichment layer — structured context only.
 * Does not redesign Intelligence OS. Does not generate prompts.
 */

export * from "./contracts";
export * from "./interfaces";
export { BrandBrainEngine } from "./engine/brand-brain-engine";
export { retrieveCandidates } from "./retrieval/retrieve";
export {
  buildEnrichmentPackage,
  enrichmentToExecutionMetadata,
} from "./enrichment/build-enrichment";
export { diffBrandBrainDocuments } from "./versioning/diff";
export { sampleBrandBrain } from "./builders/sample-brand-brain";
export {
  BrandBrainUpsertBuilder,
  BrandBrainRetrievalBuilder,
} from "./builders/brand-brain-builders";
export {
  createBrandBrainPlatform,
  type BrandBrainPlatform,
  type CreateBrandBrainOptions,
} from "./factories/create-brand-brain-platform";
