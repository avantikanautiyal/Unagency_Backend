/**
 * OS layer ports — active refinement/delivery/governance contracts only.
 */

import type { OsLayerImplementationStatus } from "./layer-status";

export interface IOutputContractRegistry {
  readonly implementationStatus: OsLayerImplementationStatus;
  getContract(capabilityId: string):
    | {
        readonly capabilityId: string;
        readonly inputSchemaRef?: string;
        readonly outputSchemaRef?: string;
        readonly requiredArtifacts?: readonly string[];
        readonly status: OsLayerImplementationStatus;
      }
    | undefined;
}

