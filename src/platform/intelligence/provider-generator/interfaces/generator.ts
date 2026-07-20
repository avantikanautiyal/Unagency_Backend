/**
 * Provider Generator interfaces.
 */

import type { Result } from "../../shared/result";
import type { ProviderGenerationRequest, ProviderManifestSpec } from "../contracts/manifest";
import type { GeneratedFileArtifact, ProviderGenerationReport } from "../contracts/result";
import type { GeneratorArtifactKind } from "../contracts/enums";

export interface IProviderTemplateRenderer {
  render(
    kind: GeneratorArtifactKind,
    context: ProviderTemplateContext
  ): Result<GeneratedFileArtifact>;
}

export interface ProviderTemplateContext {
  readonly manifest: ProviderManifestSpec;
  readonly classPrefix: string;
  readonly packageRoot: string;
  readonly constantPrefix: string;
}

export interface IProviderManifestValidator {
  validate(manifest: ProviderManifestSpec): Result<void>;
}

export interface ICapabilityMapperPlanner {
  plan(manifest: ProviderManifestSpec): Result<readonly string[]>;
}

export interface IModelResolverPlanner {
  plan(manifest: ProviderManifestSpec): Result<Readonly<Record<string, unknown>>>;
}

export interface ICertificationPlanner {
  plan(manifest: ProviderManifestSpec): Result<readonly string[]>;
}

export interface IProviderGeneratorEngine {
  generate(request: ProviderGenerationRequest): Promise<Result<ProviderGenerationReport>>;
}
