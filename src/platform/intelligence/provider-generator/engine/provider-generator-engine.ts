/**
 * Provider Generator Engine — Manifest → complete GeneratedProviderPackage.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ProviderGenerationRequest } from "../contracts/manifest";
import type { ProviderGenerationReport, GeneratedFileArtifact } from "../contracts/result";
import type { GeneratorArtifactKind } from "../contracts/enums";
import {
  asGeneratedPackageId,
  asProviderGenerationId,
} from "../contracts/identifiers";
import type {
  IProviderGeneratorEngine,
  IProviderManifestValidator,
  IProviderTemplateRenderer,
  ICapabilityMapperPlanner,
  IModelResolverPlanner,
  ICertificationPlanner,
} from "../interfaces/generator";
import { buildTemplateContext } from "../builders/naming";
import {
  CANONICAL_INTEGRATION_TARGETS,
  PROVIDER_GENERATOR_VERSION,
  REQUIRED_ARTIFACT_KINDS,
} from "../constants";
import { planDiscovery } from "../discovery/discovery-plan";

export interface ProviderGeneratorEngineDeps {
  readonly validator: IProviderManifestValidator;
  readonly renderer: IProviderTemplateRenderer;
  readonly capabilityPlanner: ICapabilityMapperPlanner;
  readonly modelResolverPlanner: IModelResolverPlanner;
  readonly certificationPlanner: ICertificationPlanner;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

const OPTIONAL_KINDS: readonly GeneratorArtifactKind[] = [
  "streaming",
  "tool_calling",
  "structured_output",
  "diagnostics",
];

export class ProviderGeneratorEngine implements IProviderGeneratorEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ProviderGeneratorEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async generate(
    request: ProviderGenerationRequest
  ): Promise<Result<ProviderGenerationReport>> {
    const start = this.clockMs();

    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }

    const validated = this.deps.validator.validate(request.manifest);
    if (!validated.ok) return validated;

    const ctx = buildTemplateContext(request.manifest);
    if (request.outputRelativePath) {
      // Keep path for diagnostics only — default mode is dry_run / in-memory.
      void request.outputRelativePath;
    }

    const kinds: GeneratorArtifactKind[] = [
      ...(REQUIRED_ARTIFACT_KINDS as unknown as GeneratorArtifactKind[]),
      ...OPTIONAL_KINDS,
    ].filter((k) => !(request.skipTests && k === "unit_test"));

    const files: GeneratedFileArtifact[] = [];
    const warnings: string[] = [];

    for (const kind of kinds) {
      const rendered = this.deps.renderer.render(kind, ctx);
      if (!rendered.ok) return rendered;
      files.push(rendered.value);
    }

    const caps = this.deps.capabilityPlanner.plan(request.manifest);
    if (!caps.ok) return caps;

    const resolverPlan = this.deps.modelResolverPlanner.plan(request.manifest);
    if (!resolverPlan.ok) return resolverPlan;

    const cert = this.deps.certificationPlanner.plan(request.manifest);
    if (!cert.ok) return cert;

    const discovery = planDiscovery(request.manifest);
    if (!discovery.neverHardcodeModels) {
      warnings.push("discovery must never hardcode models");
    }

    if (request.mode === "materialize") {
      warnings.push(
        "materialize mode is advisory in this milestone — package returned in-memory only; write files outside frozen modules via external tooling"
      );
    }

    const integrationChecklist = CANONICAL_INTEGRATION_TARGETS.map(
      (t) => `Compatible with ${t} via public interfaces (no frozen module edits)`
    );

    const package_ = {
      packageId: asGeneratedPackageId(this.createId("genpkg")),
      providerId: request.manifest.providerId,
      packageRoot: ctx.packageRoot,
      files,
      integrationChecklist,
      certificationChecklist: cert.value,
      manifest: request.manifest,
      version: PROVIDER_GENERATOR_VERSION,
    };

    return success({
      generationId: asProviderGenerationId(this.createId("gen")),
      requestId: request.requestId,
      request,
      package: package_,
      diagnostics: {
        fileCount: files.length,
        kindsEmitted: files.map((f) => f.kind),
        warnings,
        durationMs: Math.max(0, this.clockMs() - start),
      },
      createdAt: this.nowIso(),
    });
  }
}
