/**
 * Factory for live (Mongo + Brand Brain) execution context stores.
 */

import { createBrandBrainPlatform } from "../../brand-brain/factories/create-brand-brain-platform";
import type { IBrandBrainEngine } from "../../brand-brain/interfaces/brand-brain";
import {
  createDefaultMongoLiveContextDeps,
  LiveBusinessContextStores,
  type LiveBusinessContextStoresDeps,
} from "./live-business-context-stores";

export function createLiveBusinessContextStores(options: {
  brandBrain?: IBrandBrainEngine;
  deps?: Partial<LiveBusinessContextStoresDeps>;
  nowIso?: () => string;
  createId?: (prefix: string) => string;
} = {}): LiveBusinessContextStores {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  let seq = 0;
  const createId =
    options.createId ?? ((p: string) => `${p}_${++seq}_${Date.now()}`);

  const brandBrain =
    options.brandBrain ??
    createBrandBrainPlatform({ nowIso, createId }).engine;

  const base = createDefaultMongoLiveContextDeps(brandBrain, nowIso);
  return new LiveBusinessContextStores({
    ...base,
    ...options.deps,
    brandBrain,
    nowIso,
  });
}

export { LiveBusinessContextStores, createDefaultMongoLiveContextDeps };
export type { LiveBusinessContextStoresDeps };
