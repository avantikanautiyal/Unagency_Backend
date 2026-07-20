/**
 * Brand Brain public interfaces.
 */

import type { Result } from "../../../intelligence/shared/result";
import type {
  BrandBrainDocument,
  BrandBrainEnrichmentPackage,
  BrandBrainRetrievalQuery,
  BrandBrainVersionDiff,
  BrandBrainVersionRecord,
} from "../contracts";

export interface UpsertBrandBrainInput {
  readonly organizationId: string;
  readonly document: BrandBrainDocument;
  readonly changelog: string;
  readonly label?: string;
  readonly createdBy?: string;
}

export interface IBrandBrainEngine {
  upsert(input: UpsertBrandBrainInput): Result<BrandBrainVersionRecord>;
  getCurrent(organizationId: string): Result<BrandBrainVersionRecord | undefined>;
  getVersion(organizationId: string, version: number): Result<BrandBrainVersionRecord | undefined>;
  listVersions(organizationId: string): Result<readonly BrandBrainVersionRecord[]>;
  compare(organizationId: string, fromVersion: number, toVersion: number): Result<BrandBrainVersionDiff>;
  rollback(organizationId: string, toVersion: number, createdBy?: string): Result<BrandBrainVersionRecord>;

  /** Retrieve + produce structured enrichment (never prompts / raw docs). */
  enrich(query: BrandBrainRetrievalQuery): Result<BrandBrainEnrichmentPackage>;

  /** Metadata envelope for Enterprise API / Business execution requests. */
  toExecutionMetadata(
    enrichment: BrandBrainEnrichmentPackage
  ): Readonly<Record<string, unknown>>;
}
