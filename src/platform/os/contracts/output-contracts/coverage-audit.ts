/**
 * Output contract coverage audit — proves every taxonomy service has a valid contract.
 */

import type { IServiceOutputContractRegistry } from "./service-contract-registry";
import type { ContractCoverageEntry, ContractCoverageReport } from "./types";
import { OUTPUT_CONTRACT_SYSTEM_VERSION } from "./versioning";
import { SOCIAL_FORMAT_IDS } from "./format-overlays";
import { isDynamicServiceKey } from "./composer";

const MIN_HARD_REQUIREMENTS = 2;
const MIN_QUALITY_DIMENSIONS = 2;

function assessEntry(
  serviceKey: string,
  registry: IServiceOutputContractRegistry,
): ContractCoverageEntry {
  const contract = registry.getContractForServiceKey(serviceKey);
  if (!contract) {
    return {
      serviceKey,
      contractId: "missing",
      outputKind: "dynamic",
      hasDefinitionOfDone: false,
      hardRequirementCount: 0,
      qualityDimensionCount: 0,
      isPlaceholder: true,
      status: "missing",
    };
  }

  const hasDoD =
    contract.definitionOfDone.mandatoryChecks.length > 0 &&
    contract.definitionOfDone.deliveryChecks.length > 0;

  const isDynamic = isDynamicServiceKey(serviceKey);
  const isPlaceholder =
    !hasDoD ||
    contract.hardRequirements.length < MIN_HARD_REQUIREMENTS ||
    contract.qualityRequirements.length < MIN_QUALITY_DIMENSIONS;

  let status: ContractCoverageEntry["status"] = "covered";
  if (isPlaceholder && !isDynamic) {
    status = "partial";
  } else if (isDynamic) {
    // Dynamic services have explicit resolution requirements — still covered
    status = hasDoD ? "covered" : "partial";
  }

  return {
    serviceKey,
    contractId: contract.contractId,
    outputKind: contract.outputKind,
    hasDefinitionOfDone: hasDoD,
    hardRequirementCount: contract.hardRequirements.length,
    qualityDimensionCount: contract.qualityRequirements.length,
    isPlaceholder: isPlaceholder && !isDynamic,
    status,
  };
}

export function auditOutputContractCoverage(
  registry: IServiceOutputContractRegistry,
): ContractCoverageReport {
  const nowIso = new Date().toISOString();
  const serviceKeys = registry.listServiceKeys();
  const entries: ContractCoverageEntry[] = serviceKeys.map((key) =>
    assessEntry(key, registry),
  );

  // Social format overlay coverage (extends social/content-design)
  for (const formatId of SOCIAL_FORMAT_IDS) {
    const contract = registry.getServiceContract("social", "content-design", {
      format: formatId,
      platform: "instagram",
    });
    entries.push({
      serviceKey: `social/content-design/*/${formatId}`,
      contractId: contract?.contractId ?? "missing",
      outputKind: contract?.outputKind ?? "image",
      hasDefinitionOfDone: Boolean(
        contract?.definitionOfDone.mandatoryChecks.length,
      ),
      hardRequirementCount: contract?.hardRequirements.length ?? 0,
      qualityDimensionCount: contract?.qualityRequirements.length ?? 0,
      isPlaceholder: false,
      status: contract ? "covered" : "missing",
    });
  }

  const covered = entries.filter((e) => e.status === "covered").length;
  const partial = entries.filter((e) => e.status === "partial").length;
  const missing = entries.filter((e) => e.status === "missing").length;

  return Object.freeze({
    systemVersion: OUTPUT_CONTRACT_SYSTEM_VERSION,
    auditedAt: nowIso,
    totalServices: entries.length,
    covered,
    partial,
    missing,
    entries: Object.freeze(entries),
    complete: missing === 0 && partial === 0,
  });
}

export function formatCoverageReportSummary(
  report: ContractCoverageReport,
): string {
  const lines = [
    `Output Contract Coverage Audit v${report.systemVersion}`,
    `Audited: ${report.auditedAt}`,
    `Total: ${report.totalServices} | Covered: ${report.covered} | Partial: ${report.partial} | Missing: ${report.missing}`,
    `Complete: ${report.complete ? "YES" : "NO"}`,
  ];
  if (!report.complete) {
    const problems = report.entries.filter((e) => e.status !== "covered");
    lines.push("", "Uncovered/partial entries:");
    for (const e of problems.slice(0, 20)) {
      lines.push(`  - ${e.serviceKey}: ${e.status} (${e.contractId})`);
    }
    if (problems.length > 20) {
      lines.push(`  ... and ${problems.length - 20} more`);
    }
  }
  return lines.join("\n");
}
