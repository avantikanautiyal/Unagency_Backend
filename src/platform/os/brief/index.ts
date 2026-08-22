/**
 * Brief Intelligence public surface (Phase 1).
 */

export * from "./contracts/structured-brief";
export * from "./contracts/errors";
export * from "./validation/validate-brief";
export * from "./engine/brief-intelligence-engine";
export * from "./engine/intent-classifier";
export * from "./adapters/brief-to-integration";
export { createBriefIntelligenceEngine } from "./engine/brief-intelligence-engine";
