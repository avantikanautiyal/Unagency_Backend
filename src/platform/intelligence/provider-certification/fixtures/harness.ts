/**
 * Certification harness context passed to validators.
 */

import type { IProviderAdapter } from "../../providers/adapters/interfaces/adapter";
import type { ProviderManifest } from "../../providers/adapters/contracts/provider-manifest";

export interface CertificationHarness {
  readonly adapter: IProviderAdapter;
  readonly manifest: ProviderManifest;
  readonly clockMs: () => number;
}
