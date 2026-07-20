/**
 * Knowledge Intelligence platform factory.
 */

import { KnowledgeIntelligenceEngine } from "../engine/knowledge-intelligence-engine";
import type { IKnowledgeIntelligenceEngine } from "../interfaces";

export interface KnowledgeIntelligencePlatform {
  readonly engine: IKnowledgeIntelligenceEngine;
}

export interface CreateKnowledgeIntelligenceOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createKnowledgeIntelligencePlatform(
  options: CreateKnowledgeIntelligenceOptions = {}
): KnowledgeIntelligencePlatform {
  return {
    engine: new KnowledgeIntelligenceEngine(options),
  };
}
