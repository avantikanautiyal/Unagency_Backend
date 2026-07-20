/**
 * Certification request — adapter + manifest under test.
 */

import type { IProviderAdapter } from "../../providers/adapters/interfaces/adapter";
import type { ProviderManifest } from "../../providers/adapters/contracts/provider-manifest";
import type { CertificationMode } from "./enums";

export interface CertificationRequest {
  readonly requestId: string;
  readonly adapter: IProviderAdapter;
  readonly manifest: ProviderManifest;
  readonly mode?: CertificationMode;
  readonly benchmarkScenarios?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
