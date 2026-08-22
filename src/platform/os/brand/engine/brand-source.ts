/**
 * Tenant-scoped brand record source for Brand Intelligence.
 * Never returns sampleBrandBrain. Missing brand → undefined.
 */

import type { BrandRecord } from "../contracts/brand-context";
import { BrandIntelligenceError } from "../contracts/errors";

export interface IBrandRecordSource {
  getBrand(input: {
    readonly organizationId: string;
    readonly brandId: string;
    readonly userId?: string;
  }): Promise<BrandRecord | undefined>;
}

/** In-memory source for tests / simulated harnesses — tenant isolated. */
export class InMemoryBrandRecordSource implements IBrandRecordSource {
  private readonly byOrg = new Map<string, Map<string, BrandRecord>>();

  upsert(record: BrandRecord): void {
    let orgMap = this.byOrg.get(record.organizationId);
    if (!orgMap) {
      orgMap = new Map();
      this.byOrg.set(record.organizationId, orgMap);
    }
    orgMap.set(record.brandId, record);
  }

  clear(): void {
    this.byOrg.clear();
  }

  async getBrand(input: {
    readonly organizationId: string;
    readonly brandId: string;
  }): Promise<BrandRecord | undefined> {
    const record = this.byOrg.get(input.organizationId)?.get(input.brandId);
    if (!record) return undefined;
    if (record.organizationId !== input.organizationId) {
      throw new BrandIntelligenceError(
        "BRAND_TENANT_VIOLATION",
        "Brand organization mismatch"
      );
    }
    return record;
  }
}

/**
 * Product Brand SoT (Mongo) — org-scoped lookup only.
 * Does not invent data; does not call sampleBrandBrain.
 */
export class ProductBrandRecordSource implements IBrandRecordSource {
  async getBrand(input: {
    readonly organizationId: string;
    readonly brandId: string;
    readonly userId?: string;
  }): Promise<BrandRecord | undefined> {
    const mongooseNs = await import("mongoose");
    const mongoose =
      (mongooseNs as { default?: typeof mongooseNs }).default ?? mongooseNs;
    if (mongoose.connection?.readyState !== 1) return undefined;
    if (!mongoose.isValidObjectId(input.brandId)) return undefined;
    if (!mongoose.isValidObjectId(input.organizationId)) return undefined;

    const Brands = (await import("../../../../models/brand.model")).default;
    const doc = await Brands.findOne({
      _id: input.brandId,
      organizationId: new mongoose.Types.ObjectId(input.organizationId),
    });
    if (!doc) return undefined;

    const { toBrandDto } = await import("../../../../services/brand-service");
    const dto = toBrandDto(doc);
    if (dto.organizationId !== input.organizationId) {
      throw new BrandIntelligenceError(
        "BRAND_TENANT_VIOLATION",
        "Brand organization mismatch"
      );
    }

    return {
      brandId: dto.id,
      organizationId: dto.organizationId,
      name: dto.name,
      updatedAt: dto.updatedAt,
      voice: dto.voice || undefined,
      positioning: dto.positioning || undefined,
      guidelines: dto.guidelines || undefined,
      industry: dto.industry || undefined,
      targetAudience: dto.targetAudience || undefined,
      website: dto.website || undefined,
      colors: dto.colors,
      logoAssetId: dto.logoAssetId,
      guidelinesProfile: dto.guidelinesProfile as Record<string, unknown>,
    };
  }
}

export function createProductBrandRecordSource(): IBrandRecordSource {
  return new ProductBrandRecordSource();
}
