/**
 * CDF 2.0 M6 — Targeted Refinement Engine.
 */

export * from "./types";
export * from "./errors";
export { parseRefinementInstruction } from "./instruction-parser";
export { interpretRefinementInstruction, setCdfRefinementAiInterpreter } from "./ai-interpreter";
export { resolveRefinementTarget } from "./target-resolver";
export { buildRefinementPatch } from "./patch-builder";
export { applyRefinementPatch, validatePatchSafety } from "./patch-applier";
export { assertIsolation, findIsolationViolations } from "./isolation-check";
export {
  applyTargetedRefinement,
} from "./service";
export {
  applyPackagingTargetedRefinement,
  isPackagingRefinementKey,
} from "./packaging-service";
export { parsePackagingRefinementInstruction } from "./packaging-instruction-parser";
export { resolvePackagingRefinementTarget } from "./packaging-target-resolver";
export { buildPackagingRefinementPatch } from "./packaging-patch-builder";
export { applyPackagingRefinementPatch } from "./packaging-patch-applier";
export { assertPackagingIsolation } from "./packaging-isolation";
export {
  applySocialMediaTargetedRefinement,
  isSocialMediaRefinementKey,
} from "./social-media-service";
export { parseSocialMediaRefinementInstruction } from "./social-media-instruction-parser";
export { resolveSocialMediaRefinementTarget } from "./social-media-target-resolver";
export { buildSocialMediaRefinementPatch } from "./social-media-patch-builder";
export { applySocialMediaRefinementPatch } from "./social-media-patch-applier";
export { assertSocialMediaIsolation } from "./social-media-isolation";
export {
  resetCdfActionIdempotencyForTests,
  lookupIdempotency,
  commitIdempotency,
  fingerprintPayload,
} from "./idempotency";
export {
  resetCdfRefinementStoreForTests,
  saveRefinementRequest,
  getRefinementRequest,
  listRefinementRequests,
} from "./store";
export { fixtureTenSlideDeck } from "./fixtures";
export {
  setCdfRefinementKnownVaultAssets,
  resetCdfRefinementVaultForTests,
  assertVaultAssetForRefinement,
} from "./vault";

import { resetCdfRefinementAiForTests } from "./ai-interpreter";
import { resetCdfActionIdempotencyForTests } from "./idempotency";
import { resetCdfRefinementStoreForTests } from "./store";
import { resetCdfRefinementVaultForTests } from "./vault";

export function resetCdfRefinementEngineForTests(): void {
  resetCdfRefinementStoreForTests();
  resetCdfActionIdempotencyForTests();
  resetCdfRefinementVaultForTests();
  resetCdfRefinementAiForTests();
}
