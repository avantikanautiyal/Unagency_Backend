/**
 * Service Output Contract Registry — canonical Definition of Done for every service.
 * Extends existing architecture; SERVICE_OUTPUT_MAP remains taxonomy SoT.
 */

import {
  resolveServiceOutputSpec,
  type ServiceOutputSpec,
} from "../../../config/service-output-map";
import type { OsLayerImplementationStatus } from "../layer-status";
import {
  buildServiceOutputContract,
  composeEffectiveOutputContract,
  enumerateServiceKeys,
  isDynamicServiceKey,
} from "./composer";
import type {
  ComposeEffectiveContractInput,
  ContractCoverageReport,
  EffectiveOutputContract,
  ServiceOutputContract,
} from "./types";
import { OUTPUT_CONTRACT_SYSTEM_VERSION } from "./versioning";
import { auditOutputContractCoverage } from "./coverage-audit";

export interface IServiceOutputContractRegistry {
  readonly implementationStatus: OsLayerImplementationStatus;
  readonly systemVersion: typeof OUTPUT_CONTRACT_SYSTEM_VERSION;
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
  resolveServiceOutputSpec(
    input: Parameters<typeof import("../../../config/service-output-map").resolveServiceOutputSpec>[0],
  ): ServiceOutputSpec | undefined;
}

export class ServiceOutputContractRegistry implements IServiceOutputContractRegistry {
  readonly implementationStatus: OsLayerImplementationStatus = "implemented";
  readonly systemVersion = OUTPUT_CONTRACT_SYSTEM_VERSION;

  getServiceContract(
    service: string,
    subtype: string,
    options?: { platform?: string; format?: string; prompt?: string },
  ): ServiceOutputContract | undefined {
    return buildServiceOutputContract({
      service,
      subtype,
      platform: options?.platform,
      format: options?.format,
      prompt: options?.prompt,
    });
  }

  composeEffectiveContract(
    input: ComposeEffectiveContractInput,
  ): EffectiveOutputContract | undefined {
    return composeEffectiveOutputContract(input);
  }

  getContractForServiceKey(serviceKey: string): ServiceOutputContract | undefined {
    const [service, subtype] = serviceKey.split("/");
    if (!service || !subtype) return undefined;
    return buildServiceOutputContract({ service, subtype });
  }

  listServiceKeys(): readonly string[] {
    return enumerateServiceKeys();
  }

  auditCoverage(): ContractCoverageReport {
    return auditOutputContractCoverage(this);
  }

  resolveServiceOutputSpec(
    input: Parameters<typeof resolveServiceOutputSpec>[0],
  ) {
    return resolveServiceOutputSpec(input);
  }
}

export const defaultServiceOutputContractRegistry =
  new ServiceOutputContractRegistry();

/** Resolve output contract ID for SpecGuard from service selection. */
export function resolveServiceOutputContractId(input: {
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
}): string {
  if (input.service && input.subtype) {
    const contract = buildServiceOutputContract({
      service: input.service,
      subtype: input.subtype,
      platform: input.platform,
      format: input.format,
    });
    if (contract) return contract.contractId;
  }
  return "output.unresolved";
}

export { isDynamicServiceKey, enumerateServiceKeys };
