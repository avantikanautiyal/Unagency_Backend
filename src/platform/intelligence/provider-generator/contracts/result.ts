/**
 * Generator outputs — complete provider package as immutable artifacts.
 */

import type { GeneratorArtifactKind } from "./enums";
import type { GeneratedPackageId, ProviderGenerationId } from "./identifiers";
import type { ProviderGenerationRequest, ProviderManifestSpec } from "./manifest";

export interface GeneratedFileArtifact {
  readonly relativePath: string;
  readonly kind: GeneratorArtifactKind;
  readonly content: string;
  readonly description: string;
}

export interface GeneratedProviderPackage {
  readonly packageId: GeneratedPackageId;
  readonly providerId: string;
  readonly packageRoot: string;
  readonly files: readonly GeneratedFileArtifact[];
  readonly integrationChecklist: readonly string[];
  readonly certificationChecklist: readonly string[];
  readonly manifest: ProviderManifestSpec;
  readonly version: string;
}

export interface ProviderGenerationDiagnostics {
  readonly fileCount: number;
  readonly kindsEmitted: readonly GeneratorArtifactKind[];
  readonly warnings: readonly string[];
  readonly durationMs: number;
}

export interface ProviderGenerationReport {
  readonly generationId: ProviderGenerationId;
  readonly requestId: string;
  readonly request: ProviderGenerationRequest;
  readonly package: GeneratedProviderPackage;
  readonly diagnostics: ProviderGenerationDiagnostics;
  readonly createdAt: string;
}
