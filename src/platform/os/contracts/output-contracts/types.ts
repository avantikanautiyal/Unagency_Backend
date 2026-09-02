/**
 * Canonical Output Contract types — machine-actionable Definition of Done.
 */

import type {
  ContractRequirement,
  QualityDimension,
} from "./evaluation-methods";
import type { ContractFailureCondition } from "./failure-model";
import type { EffectiveContractIdentity } from "./versioning";
import type {
  DownloadFormat,
  MockupRole,
  ServiceOutputKind,
  ServiceOutputSpec,
} from "../../../config/service-output-map";

export type DeliverableSpec = {
  readonly primaryArtifact: string;
  readonly secondaryArtifacts?: readonly string[];
  readonly supportedFormats: readonly DownloadFormat[];
  readonly defaultFormat?: DownloadFormat;
  readonly consumableBy: readonly ("user" | "delivery" | "next_system")[];
};

export type DefinitionOfDone = {
  readonly mandatoryChecks: readonly string[];
  readonly qualityChecks: readonly string[];
  readonly deliveryChecks: readonly string[];
};

export type OutputContractProvenance = {
  readonly source: "service_output_map" | "kind_template" | "global_rules" | "industry_overlay" | "brand" | "user_task" | "format_overlay";
  readonly reference?: string;
};

export type ServiceOutputContract = {
  readonly contractId: string;
  readonly version: string;
  readonly service: string;
  readonly subtype: string;
  readonly platform?: string;
  readonly format?: string;
  readonly productPath: string;
  readonly outputKind: ServiceOutputKind;
  readonly mockupRole: MockupRole;
  readonly exampleDeliverable: string;
  readonly serviceOutputSpec: ServiceOutputSpec;
  readonly deliverables: DeliverableSpec;
  readonly hardRequirements: readonly ContractRequirement[];
  readonly qualityRequirements: readonly QualityDimension[];
  readonly failureConditions: readonly ContractFailureCondition[];
  readonly definitionOfDone: DefinitionOfDone;
  readonly provenance: readonly OutputContractProvenance[];
  readonly structuredSchemaRef?: string;
};

export type EffectiveOutputContract = ServiceOutputContract & {
  readonly identity: EffectiveContractIdentity;
  readonly compositionTrace: readonly CompositionTraceEntry[];
  readonly industryOverlayId?: string;
  readonly brandRequirementIds?: readonly string[];
  readonly userTaskRequirementIds?: readonly string[];
};

export type CompositionTraceEntry = {
  readonly layer: EffectiveContractIdentity["layerVersions"][number]["layer"];
  readonly contractId: string;
  readonly version: string;
  readonly action: "inherit" | "add" | "override";
  readonly requirementIds?: readonly string[];
};

export type ComposeEffectiveContractInput = {
  readonly service: string;
  readonly subtype: string;
  readonly platform?: string;
  readonly format?: string;
  readonly prompt?: string;
  readonly industry?: string;
  readonly brandRequirements?: readonly ContractRequirement[];
  readonly userTaskRequirements?: readonly ContractRequirement[];
  readonly nowIso?: () => string;
};

export type ContractCoverageEntry = {
  readonly serviceKey: string;
  readonly contractId: string;
  readonly outputKind: ServiceOutputKind;
  readonly hasDefinitionOfDone: boolean;
  readonly hardRequirementCount: number;
  readonly qualityDimensionCount: number;
  readonly isPlaceholder: boolean;
  readonly status: "covered" | "partial" | "missing";
};

export type ContractCoverageReport = {
  readonly systemVersion: string;
  readonly auditedAt: string;
  readonly totalServices: number;
  readonly covered: number;
  readonly partial: number;
  readonly missing: number;
  readonly entries: readonly ContractCoverageEntry[];
  readonly complete: boolean;
};
