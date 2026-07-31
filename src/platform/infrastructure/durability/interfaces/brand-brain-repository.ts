/**
 * Brand Brain version persistence port.
 */

import type { BrandBrainVersionRecord } from "../../../business/brand-brain/contracts";

export interface IBrandBrainRepository {
  saveVersion(record: BrandBrainVersionRecord): Promise<void>;
  listVersions(organizationId: string): Promise<readonly BrandBrainVersionRecord[]>;
  getCurrent(organizationId: string): Promise<BrandBrainVersionRecord | undefined>;
}
