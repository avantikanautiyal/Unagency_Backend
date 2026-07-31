/**
 * Brand Brain Engine — proprietary organizational intelligence.
 * Persists via optional IBrandBrainRepository for restart/multi-instance safety.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../../intelligence/shared/errors";
import type {
  BrandBrainEnrichmentPackage,
  BrandBrainRetrievalQuery,
  BrandBrainVersionDiff,
  BrandBrainVersionRecord,
} from "../contracts";
import type { IBrandBrainEngine, UpsertBrandBrainInput } from "../interfaces";
import type { IBrandBrainRepository } from "../../../infrastructure/durability/interfaces/brand-brain-repository";
import { diffBrandBrainDocuments } from "../versioning/diff";
import {
  buildEnrichmentPackage,
  enrichmentToExecutionMetadata,
} from "../enrichment/build-enrichment";

export interface BrandBrainEngineDeps {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly repository?: IBrandBrainRepository;
}

export class BrandBrainEngine implements IBrandBrainEngine {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;
  private readonly repository?: IBrandBrainRepository;
  /** organizationId → versions ascending (L1 cache) */
  private readonly versions = new Map<string, BrandBrainVersionRecord[]>();

  constructor(deps: BrandBrainEngineDeps = {}) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    const clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${clockMs()}`);
    this.repository = deps.repository;
  }

  async ensureHydrated(organizationId: string): Promise<void> {
    if (!this.repository) return;
    if (this.versions.has(organizationId)) return;
    const persisted = await this.repository.listVersions(organizationId);
    if (persisted.length) {
      this.versions.set(organizationId, [...persisted]);
    }
  }

  async upsert(input: UpsertBrandBrainInput): Promise<Result<BrandBrainVersionRecord>> {
    if (!input.organizationId?.trim()) {
      return failure(new ValidationError("organizationId required"));
    }
    if (input.document.organizationId !== input.organizationId) {
      return failure(new ValidationError("document.organizationId mismatch"));
    }
    if (!input.changelog?.trim()) {
      return failure(new ValidationError("changelog required for versioning"));
    }

    await this.ensureHydrated(input.organizationId);

    const existing = this.versions.get(input.organizationId) ?? [];
    const nextVersion = existing.length ? existing[existing.length - 1]!.version + 1 : 1;
    const record: BrandBrainVersionRecord = {
      versionId: this.createId("bbv"),
      organizationId: input.organizationId,
      version: nextVersion,
      label: input.label,
      document: input.document,
      createdAt: this.nowIso(),
      createdBy: input.createdBy,
      changelog: input.changelog,
    };
    this.versions.set(input.organizationId, [...existing, record]);
    if (this.repository) {
      await this.repository.saveVersion(record);
    }
    return success(record);
  }

  async getCurrent(
    organizationId: string
  ): Promise<Result<BrandBrainVersionRecord | undefined>> {
    await this.ensureHydrated(organizationId);
    const list = this.versions.get(organizationId) ?? [];
    return success(list.length ? list[list.length - 1] : undefined);
  }

  async getVersion(
    organizationId: string,
    version: number
  ): Promise<Result<BrandBrainVersionRecord | undefined>> {
    await this.ensureHydrated(organizationId);
    const list = this.versions.get(organizationId) ?? [];
    return success(list.find((v) => v.version === version));
  }

  async listVersions(
    organizationId: string
  ): Promise<Result<readonly BrandBrainVersionRecord[]>> {
    await this.ensureHydrated(organizationId);
    return success(this.versions.get(organizationId) ?? []);
  }

  async compare(
    organizationId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<Result<BrandBrainVersionDiff>> {
    await this.ensureHydrated(organizationId);
    const from = this.versions.get(organizationId)?.find((v) => v.version === fromVersion);
    const to = this.versions.get(organizationId)?.find((v) => v.version === toVersion);
    if (!from || !to) return failure(new NotFoundError("version not found"));
    const diff = diffBrandBrainDocuments(from.document, to.document);
    return success({ ...diff, fromVersion, toVersion });
  }

  async rollback(
    organizationId: string,
    toVersion: number,
    createdBy?: string
  ): Promise<Result<BrandBrainVersionRecord>> {
    const target = (await this.getVersion(organizationId, toVersion)).ok
      ? (await this.getVersion(organizationId, toVersion)).value
      : undefined;
    if (!target) return failure(new NotFoundError("rollback target not found"));
    return this.upsert({
      organizationId,
      document: target.document,
      changelog: `rollback to version ${toVersion}`,
      label: `rollback-v${toVersion}`,
      createdBy,
    });
  }

  async enrich(query: BrandBrainRetrievalQuery): Promise<Result<BrandBrainEnrichmentPackage>> {
    if (!query.organizationId?.trim()) {
      return failure(new ValidationError("organizationId required"));
    }
    const current = await this.getCurrent(query.organizationId);
    if (!current.ok) return current;
    if (!current.value) {
      return failure(new NotFoundError("brand brain not found for organization"));
    }
    const package_ = buildEnrichmentPackage(
      current.value,
      query,
      this.createId("bbe"),
      this.nowIso,
      this.createId
    );
    return success(package_);
  }

  toExecutionMetadata(
    enrichment: BrandBrainEnrichmentPackage
  ): Readonly<Record<string, unknown>> {
    return enrichmentToExecutionMetadata(enrichment);
  }
}
