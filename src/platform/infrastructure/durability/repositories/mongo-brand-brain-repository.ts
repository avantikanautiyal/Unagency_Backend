/**
 * Mongo-backed Brand Brain version repository.
 */

import type { BrandBrainVersionRecord } from "../../../business/brand-brain/contracts";
import type { IBrandBrainRepository } from "../interfaces/brand-brain-repository";
import { EnterpriseBrandVersion } from "../mongo/models/enterprise-brand-version.model";

export class MongoBrandBrainRepository implements IBrandBrainRepository {
  async saveVersion(record: BrandBrainVersionRecord): Promise<void> {
    await EnterpriseBrandVersion.updateOne(
      { versionId: record.versionId },
      {
        $set: {
          versionId: record.versionId,
          organizationId: record.organizationId,
          version: record.version,
          label: record.label,
          document: record.document,
          createdAt: record.createdAt,
          createdBy: record.createdBy,
          changelog: record.changelog,
        },
      },
      { upsert: true }
    );
  }

  async listVersions(organizationId: string): Promise<readonly BrandBrainVersionRecord[]> {
    const docs = await EnterpriseBrandVersion.find({ organizationId })
      .sort({ version: 1 })
      .lean();
    return docs.map((d) => ({
      versionId: d.versionId,
      organizationId: d.organizationId,
      version: d.version,
      label: d.label,
      document: d.document,
      createdAt: d.createdAt,
      createdBy: d.createdBy,
      changelog: d.changelog,
    }));
  }

  async getCurrent(organizationId: string): Promise<BrandBrainVersionRecord | undefined> {
    const doc = await EnterpriseBrandVersion.findOne({ organizationId })
      .sort({ version: -1 })
      .lean();
    if (!doc) return undefined;
    return {
      versionId: doc.versionId,
      organizationId: doc.organizationId,
      version: doc.version,
      label: doc.label,
      document: doc.document,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      changelog: doc.changelog,
    };
  }
}
