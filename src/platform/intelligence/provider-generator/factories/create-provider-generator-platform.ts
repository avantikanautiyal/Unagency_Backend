/**
 * Provider Generator factory.
 */

import { ProviderGeneratorEngine } from "../engine/provider-generator-engine";
import { DefaultProviderManifestValidator } from "../manifests/manifest-validator";
import { CanonicalProviderTemplateRenderer } from "../templates/canonical-renderer";
import { DefaultCapabilityMapperPlanner } from "../capability-mapper/capability-mapper-planner";
import { DefaultModelResolverPlanner } from "../model-resolver/model-resolver-planner";
import { DefaultCertificationPlanner } from "../certification/certification-planner";
import type { IProviderGeneratorEngine } from "../interfaces/generator";

export interface ProviderGeneratorPlatform {
  readonly engine: IProviderGeneratorEngine;
}

export interface CreateProviderGeneratorOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createProviderGeneratorPlatform(
  options: CreateProviderGeneratorOptions = {}
): ProviderGeneratorPlatform {
  const engine = new ProviderGeneratorEngine({
    validator: new DefaultProviderManifestValidator(),
    renderer: new CanonicalProviderTemplateRenderer(),
    capabilityPlanner: new DefaultCapabilityMapperPlanner(),
    modelResolverPlanner: new DefaultModelResolverPlanner(),
    certificationPlanner: new DefaultCertificationPlanner(),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });
  return { engine };
}
