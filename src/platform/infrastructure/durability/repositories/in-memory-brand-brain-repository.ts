/**
 * Shared in-memory Brand Brain repository — simulates durable store for tests.
 */

import type { BrandBrainVersionRecord } from "../../../business/brand-brain/contracts";
import type { IBrandBrainRepository } from "../interfaces/brand-brain-repository";

export class InMemoryBrandBrainRepository implements IBrandBrainRepository {
  private readonly versions = new Map<string, BrandBrainVersionRecord[]>();

  async saveVersion(record: BrandBrainVersionRecord): Promise<void> {
    const list = this.versions.get(record.organizationId) ?? [];
    const withoutDup = list.filter((v) => v.versionId !== record.versionId);
    this.versions.set(record.organizationId, [...withoutDup, record]);
  }

  async listVersions(organizationId: string): Promise<readonly BrandBrainVersionRecord[]> {
    return [...(this.versions.get(organizationId) ?? [])].sort(
      (a, b) => a.version - b.version
    );
  }

  async getCurrent(organizationId: string): Promise<BrandBrainVersionRecord | undefined> {
    const list = await this.listVersions(organizationId);
    return list.length ? list[list.length - 1] : undefined;
  }

  /** Test helper — clear all state */
  clear(): void {
    this.versions.clear();
  }
}
