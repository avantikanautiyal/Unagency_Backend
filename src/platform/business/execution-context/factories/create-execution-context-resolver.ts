/**
 * Factory for ExecutionContextResolver.
 */

import { createBrandBrainPlatform } from "../../brand-brain/factories/create-brand-brain-platform";
import { createKnowledgeIntelligencePlatform } from "../../knowledge-intelligence/factories/create-knowledge-intelligence-platform";
import type { IBrandBrainEngine } from "../../brand-brain/interfaces/brand-brain";
import {
  ExecutionContextResolver,
  type ExecutionContextResolverDeps,
} from "../execution-context-resolver";
import {
  InMemoryExecutionContextStores,
  type IExecutionContextStores,
} from "../stores/execution-context-stores";
import { createLiveBusinessContextStores } from "../live";

export interface CreateExecutionContextResolverOptions {
  readonly stores?: IExecutionContextStores;
  /** When true and stores omitted, use Mongo + Brand Brain live stores. */
  readonly useLiveBusinessContext?: boolean;
  readonly brandBrain?: IBrandBrainEngine;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly requireBrand?: boolean;
}

export function createExecutionContextResolver(
  options: CreateExecutionContextResolverOptions = {}
): ExecutionContextResolver {
  let seq = 0;
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((p: string) => `${p}_${++seq}_${Date.now()}`);

  const brandBrain =
    options.brandBrain ??
    createBrandBrainPlatform({ nowIso, createId }).engine;

  const businessKnowledge = createKnowledgeIntelligencePlatform({
    nowIso,
    createId,
  }).engine;

  const stores =
    options.stores ??
    (options.useLiveBusinessContext
      ? createLiveBusinessContextStores({ brandBrain, nowIso, createId })
      : new InMemoryExecutionContextStores());

  const deps: ExecutionContextResolverDeps = {
    stores,
    brandBrain,
    businessKnowledge,
    nowIso,
    createId,
    requireBrand: options.requireBrand,
  };

  return new ExecutionContextResolver(deps);
}

export { InMemoryExecutionContextStores };
