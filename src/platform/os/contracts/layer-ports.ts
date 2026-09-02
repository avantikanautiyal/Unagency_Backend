/**
 * OS layer ports — active refinement/delivery/governance contracts only.
 */

import type { OsLayerImplementationStatus } from "./layer-status";
import type {
  ComposeEffectiveContractInput,
  ContractCoverageReport,
  EffectiveOutputContract,
  ServiceOutputContract,
} from "./output-contracts/types";

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

/** Canonical service-level output contracts — Definition of Done per taxonomy entry. */
export interface IServiceOutputContractRegistry {
  readonly implementationStatus: OsLayerImplementationStatus;
  readonly systemVersion: string;
  getServiceContract(
    service: string,
    subtype: string,
    options?: { platform?: string; format?: string; prompt?: string },
  ): ServiceOutputContract | undefined;
  composeEffectiveContract(
    input: ComposeEffectiveContractInput,
  ): EffectiveOutputContract | undefined;
  getContractForServiceKey(serviceKey: string): ServiceOutputContract | undefined;
  listServiceKeys(): readonly string[];
  auditCoverage(): ContractCoverageReport;
}

export interface IBrandGuard {
  readonly implementationStatus: OsLayerImplementationStatus;
}

export interface ISpecGuard {
  readonly implementationStatus: OsLayerImplementationStatus;
}

export interface IApprovalService {
  readonly implementationStatus: "implemented";
}

export interface IDeliveryService {
  readonly implementationStatus: "implemented";
}

export interface IRefinementEngine {
  readonly implementationStatus: "implemented";
}

export interface IAuditService {
  readonly implementationStatus: OsLayerImplementationStatus;
}
