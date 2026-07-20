/**
 * Provider Certification factory.
 */

import { ProviderCertificationEngine } from "../engine/certification-engine";
import type { IProviderCertificationEngine } from "../interfaces/certification";

export interface ProviderCertificationPlatform {
  readonly engine: IProviderCertificationEngine;
}

export interface CreateProviderCertificationOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createProviderCertificationPlatform(
  options: CreateProviderCertificationOptions = {}
): ProviderCertificationPlatform {
  const engine = new ProviderCertificationEngine({
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });
  return { engine };
}
