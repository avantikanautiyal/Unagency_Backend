/**
 * Brand Brain platform factory.
 */

import { BrandBrainEngine } from "../engine/brand-brain-engine";
import type { IBrandBrainEngine } from "../interfaces";

export interface BrandBrainPlatform {
  readonly engine: IBrandBrainEngine;
}

export interface CreateBrandBrainOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createBrandBrainPlatform(
  options: CreateBrandBrainOptions = {}
): BrandBrainPlatform {
  return {
    engine: new BrandBrainEngine(options),
  };
}
