/**
 * Brand Brain testing helpers.
 */

import {
  createBrandBrainPlatform,
  type BrandBrainPlatform,
  type CreateBrandBrainOptions,
} from "../factories/create-brand-brain-platform";
import { sampleBrandBrain } from "../builders/sample-brand-brain";

export function deterministicBrandBrainHelpers() {
  let id = 0;
  let ms = 20_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 13),
  };
}

export function setupBrandBrain(
  options: CreateBrandBrainOptions = {}
): BrandBrainPlatform {
  const h = deterministicBrandBrainHelpers();
  return createBrandBrainPlatform({
    createId: h.createId,
    nowIso: h.nowIso,
    clockMs: h.clockMs,
    ...options,
  });
}

export { sampleBrandBrain };
