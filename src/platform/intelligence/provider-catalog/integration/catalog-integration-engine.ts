/**
 * Catalog Integration Engine — spreadsheet → generator → instantiate → register.
 * No provider bypasses the Universal Provider Generator.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { IProviderGeneratorEngine } from "../../provider-generator/interfaces/generator";
import type { GeneratedProviderPackage } from "../../provider-generator/contracts/result";
import { REQUIRED_ARTIFACT_KINDS } from "../../provider-generator/constants";
import {
  PROVIDER_CATALOG_SEED,
  type CatalogProviderEntry,
} from "../catalog/provider-catalog-seed";
import { catalogEntryToManifest } from "../catalog/catalog-to-manifest";
import {
  instantiateCatalogProvider,
  type CatalogProviderPlatform,
} from "../runtime/instantiate-catalog-provider";
import {
  registerProviderWithOs,
  type OsRegistrationTargets,
  type ProviderRegistrationRecord,
} from "../registration/os-registration";

export interface CatalogIntegrationRequest {
  readonly requestId: string;
  /** Defaults to full catalog. */
  readonly providerIds?: readonly string[];
  /**
   * When true (default), only providers that pass catalog certification become ACTIVE.
   * Failures remain experimental.
   */
  readonly requireCertificationForActive?: boolean;
}

export interface IntegratedProviderRecord {
  readonly entry: CatalogProviderEntry;
  readonly generationPackage: GeneratedProviderPackage;
  readonly platform: CatalogProviderPlatform;
  readonly registration: ProviderRegistrationRecord;
  readonly usedExistingOpenAILeaf: boolean;
  readonly certified: boolean;
  readonly certificationNotes: readonly string[];
}

export interface CatalogIntegrationReport {
  readonly requestId: string;
  readonly providersIntegrated: readonly IntegratedProviderRecord[];
  readonly providerCount: number;
  readonly modelBootstrapCount: number;
  readonly generationFileCount: number;
  readonly activeCount: number;
  readonly experimentalCount: number;
  readonly allViaGenerator: true;
  readonly skippedInventedProviders: 0;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface CatalogIntegrationEngineDeps {
  readonly generator: IProviderGeneratorEngine;
  readonly targets: OsRegistrationTargets;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

/** Catalog certification gate — package completeness before ACTIVE. */
export function evaluateCatalogCertification(
  pkg: GeneratedProviderPackage
): { certified: boolean; notes: readonly string[] } {
  const notes: string[] = [];
  const kinds = new Set(pkg.files.map((f) => f.kind));
  const missing = REQUIRED_ARTIFACT_KINDS.filter((k) => !kinds.has(k));
  if (missing.length) {
    notes.push(`missing_artifacts:${missing.join(",")}`);
    return { certified: false, notes };
  }
  notes.push("required_artifacts_present");

  const discovery = pkg.files.find((f) => f.kind === "discovery");
  if (!discovery?.content.includes("discover")) {
    notes.push("discovery_incomplete");
    return { certified: false, notes };
  }
  notes.push("discovery_present");

  const resolver = pkg.files.find((f) => f.kind === "model_resolver");
  if (!resolver?.content.includes("DesiredCapabilityProfile")) {
    notes.push("resolver_incomplete");
    return { certified: false, notes };
  }
  notes.push("resolver_present");

  if (!pkg.certificationChecklist.length) {
    notes.push("empty_certification_checklist");
    return { certified: false, notes };
  }
  notes.push("certification_checklist_ok");
  notes.push(...pkg.certificationChecklist.map((c) => `cert:${c}`));

  return { certified: true, notes };
}

export class CatalogIntegrationEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;

  constructor(private readonly deps: CatalogIntegrationEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
  }

  async integrate(
    request: CatalogIntegrationRequest
  ): Promise<Result<CatalogIntegrationReport>> {
    const start = this.clockMs();
    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }

    const requireCert = request.requireCertificationForActive ?? true;
    const filter = request.providerIds ? new Set(request.providerIds) : undefined;
    const entries = PROVIDER_CATALOG_SEED.filter(
      (e) => !filter || filter.has(e.providerId)
    );

    if (entries.length === 0) {
      return failure(new ValidationError("no catalog providers selected"));
    }

    const integrated: IntegratedProviderRecord[] = [];
    let generationFileCount = 0;
    let modelBootstrapCount = 0;

    for (const entry of entries) {
      const manifest = catalogEntryToManifest(entry);

      // EVERY provider must pass through the Universal Provider Generator.
      const generation = await this.deps.generator.generate({
        requestId: `${request.requestId}_${entry.providerId}`,
        manifest,
        mode: "dry_run",
      });
      if (!generation.ok) return generation;

      const pkg = generation.value.package;
      generationFileCount += pkg.files.length;

      const gate = evaluateCatalogCertification(pkg);
      const activeEligible = requireCert ? gate.certified : true;

      const platform = instantiateCatalogProvider({
        entry,
        manifest,
        generation: pkg,
        certified: activeEligible,
      });

      const discovered = await platform.discoverModels();
      if (!discovered.ok) return discovered;
      modelBootstrapCount += discovered.value.models.length;

      const registration = await registerProviderWithOs(
        platform,
        this.deps.targets,
        activeEligible
      );
      if (!registration.ok) return registration;

      integrated.push({
        entry,
        generationPackage: pkg,
        platform,
        registration: registration.value,
        usedExistingOpenAILeaf: entry.existingLeaf === "openai",
        certified: activeEligible,
        certificationNotes: gate.notes,
      });
    }

    return success({
      requestId: request.requestId,
      providersIntegrated: integrated,
      providerCount: integrated.length,
      modelBootstrapCount,
      generationFileCount,
      activeCount: integrated.filter((p) => p.platform.getStatus() === "active").length,
      experimentalCount: integrated.filter((p) => p.platform.getStatus() === "experimental")
        .length,
      allViaGenerator: true,
      skippedInventedProviders: 0,
      durationMs: this.clockMs() - start,
      createdAt: this.nowIso(),
    });
  }
}
