/**
 * Output contract composition engine.
 *
 * GLOBAL RULES + KIND TEMPLATE + SERVICE EXTENSION + FORMAT OVERLAY
 * + INDUSTRY OVERLAY + BRAND + USER/TASK = EFFECTIVE OUTPUT CONTRACT
 */

import {
  SERVICE_OUTPUT_MAP,
  resolveServiceOutputSpec,
  type ServiceOutputKind,
} from "../../../config/service-output-map";
import {
  GLOBAL_HARD_REQUIREMENTS,
  GLOBAL_QUALITY_DIMENSIONS,
  globalRulesContractMeta,
} from "./global-rules";
import {
  effectiveKindForSocialFormat,
  formatOverlayContractId,
  formatOverlayRequirements,
  FORMAT_OVERLAY_VERSION,
} from "./format-overlays";
import {
  deliverableSpecFromKind,
  kindTemplateFor,
  kindContractId,
} from "./kind-templates";
import { OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION } from "./versioning";
import { resolveIndustryOverlay } from "./industry-overlays";
import { resolveServiceExtension } from "./service-overrides";
import { STANDARD_FAILURE_CONDITIONS } from "./failure-model";
import type {
  ComposeEffectiveContractInput,
  CompositionTraceEntry,
  EffectiveOutputContract,
  OutputContractProvenance,
  ServiceOutputContract,
} from "./types";
import type { ContractRequirement, QualityDimension } from "./evaluation-methods";
import {
  OUTPUT_CONTRACT_SYSTEM_VERSION,
  type ContractLayerVersion,
  type EffectiveContractIdentity,
} from "./versioning";

const SERVICE_CONTRACT_VERSION = "1.0.0" as const;

function mergeRequirements(
  ...groups: readonly (readonly ContractRequirement[] | undefined)[]
): readonly ContractRequirement[] {
  const map = new Map<string, ContractRequirement>();
  for (const group of groups) {
    if (!group) continue;
    for (const req of group) {
      map.set(req.id, req);
    }
  }
  return Object.freeze([...map.values()]);
}

function mergeQualityDimensions(
  ...groups: readonly (readonly QualityDimension[] | undefined)[]
): readonly QualityDimension[] {
  const map = new Map<string, QualityDimension>();
  for (const group of groups) {
    if (!group) continue;
    for (const dim of group) {
      const existing = map.get(dim.id);
      if (!existing || (dim.weight ?? 0) >= (existing.weight ?? 0)) {
        map.set(dim.id, dim);
      }
    }
  }
  return Object.freeze([...map.values()]);
}

function buildProductPath(input: {
  service: string;
  subtype: string;
  platform?: string;
  format?: string;
}): string {
  const parts = [input.service, input.subtype];
  if (input.platform) parts.push(input.platform);
  if (input.format) parts.push(input.format);
  return parts.join("/");
}

function serviceContractId(service: string, subtype: string): string {
  return `service.${service}.${subtype}`;
}

export function buildServiceOutputContract(input: {
  readonly service: string;
  readonly subtype: string;
  readonly platform?: string;
  readonly format?: string;
  readonly prompt?: string;
}): ServiceOutputContract | undefined {
  const spec = resolveServiceOutputSpec({
    service: input.service,
    subtype: input.subtype,
    prompt: input.prompt,
  });
  if (!spec) return undefined;

  const effectiveKind: ServiceOutputKind =
    input.service === "social" &&
    input.subtype === "content-design" &&
    input.format
      ? effectiveKindForSocialFormat(spec.kind, input.format)
      : spec.kind;

  const effectiveSpec =
    effectiveKind !== spec.kind ? { ...spec, kind: effectiveKind } : spec;

  const kindTemplate = kindTemplateFor(effectiveSpec);
  const serviceExt = resolveServiceExtension(input.service, input.subtype);

  const formatReqs =
    input.service === "social" &&
    input.subtype === "content-design" &&
    input.format
      ? formatOverlayRequirements(input.format, input.platform)
      : undefined;

  const hardRequirements = mergeRequirements(
    GLOBAL_HARD_REQUIREMENTS,
    kindTemplate.hardRequirements,
    serviceExt?.hardRequirements,
    formatReqs,
  );

  const qualityRequirements = mergeQualityDimensions(
    GLOBAL_QUALITY_DIMENSIONS,
    kindTemplate.qualityDimensions,
    serviceExt?.qualityDimensions,
  );

  const mandatoryDoD = [
    ...kindTemplate.definitionOfDone.mandatoryChecks,
    ...(serviceExt?.mandatoryDoDExtras ?? []),
  ];
  if (formatReqs?.length) {
    mandatoryDoD.push(...formatReqs.map((r) => r.id));
  }

  const productPath = buildProductPath(input);
  const contractId = serviceContractId(input.service, input.subtype);

  return Object.freeze({
    contractId,
    version: SERVICE_CONTRACT_VERSION,
    service: input.service,
    subtype: input.subtype,
    platform: input.platform,
    format: input.format,
    productPath,
    outputKind: effectiveKind,
    mockupRole: effectiveSpec.mockupRole,
    exampleDeliverable: effectiveSpec.exampleDeliverable,
    serviceOutputSpec: effectiveSpec,
    deliverables: deliverableSpecFromKind(kindTemplate, effectiveSpec),
    hardRequirements,
    qualityRequirements,
    failureConditions: kindTemplate.failureConditions,
    definitionOfDone: Object.freeze({
      mandatoryChecks: Object.freeze([...new Set(mandatoryDoD)]),
      qualityChecks: Object.freeze([
        ...new Set([
          ...kindTemplate.definitionOfDone.qualityChecks,
          ...qualityRequirements.map((q) => q.id),
        ]),
      ]),
      deliveryChecks: Object.freeze([
        ...new Set(kindTemplate.definitionOfDone.deliveryChecks),
      ]),
    }),
    provenance: Object.freeze([
      { source: "service_output_map" as const, reference: `${input.service}/${input.subtype}` },
      { source: "kind_template" as const, reference: kindContractId(effectiveKind) },
      { source: "global_rules" as const, reference: globalRulesContractMeta().contractId },
      ...(serviceExt ? [{ source: "service_output_map" as const, reference: contractId }] : []),
      ...(formatReqs?.length
        ? [{ source: "format_overlay" as const, reference: formatOverlayContractId(input.format!) }]
        : []),
    ] satisfies readonly OutputContractProvenance[]),
    structuredSchemaRef:
      serviceExt?.structuredSchemaRef ?? kindTemplate.structuredSchemaRef,
  });
}

export function composeEffectiveOutputContract(
  input: ComposeEffectiveContractInput,
): EffectiveOutputContract | undefined {
  const base = buildServiceOutputContract(input);
  if (!base) return undefined;

  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const trace: CompositionTraceEntry[] = [];
  const layerVersions: ContractLayerVersion[] = [];

  trace.push({
    layer: "global",
    contractId: globalRulesContractMeta().contractId,
    version: globalRulesContractMeta().version,
    action: "inherit",
    requirementIds: GLOBAL_HARD_REQUIREMENTS.map((r) => r.id),
  });
  layerVersions.push({
    layer: "global",
    version: globalRulesContractMeta().version,
    contractId: globalRulesContractMeta().contractId,
  });

  trace.push({
    layer: "kind",
    contractId: kindContractId(base.outputKind),
    version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
    action: "inherit",
  });
  layerVersions.push({
    layer: "kind",
    version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
    contractId: kindContractId(base.outputKind),
  });

  trace.push({
    layer: "service",
    contractId: base.contractId,
    version: base.version,
    action: "add",
  });
  layerVersions.push({
    layer: "service",
    version: base.version,
    contractId: base.contractId,
  });

  if (input.format && input.service === "social" && input.subtype === "content-design") {
    trace.push({
      layer: "format",
      contractId: formatOverlayContractId(input.format),
      version: FORMAT_OVERLAY_VERSION,
      action: "add",
    });
    layerVersions.push({
      layer: "format",
      version: FORMAT_OVERLAY_VERSION,
      contractId: formatOverlayContractId(input.format),
    });
  }

  let hardRequirements: readonly ContractRequirement[] = [...base.hardRequirements];
  let qualityRequirements: readonly QualityDimension[] = [...base.qualityRequirements];
  let industryOverlayId: string | undefined;
  let brandRequirementIds: string[] | undefined;
  let userTaskRequirementIds: string[] | undefined;

  const industryOverlay = resolveIndustryOverlay(input.industry);
  if (industryOverlay) {
    industryOverlayId = industryOverlay.overlayId;
    hardRequirements = mergeRequirements(hardRequirements, industryOverlay.hardRequirements);
    qualityRequirements = mergeQualityDimensions(
      qualityRequirements,
      industryOverlay.qualityDimensions,
    );
    trace.push({
      layer: "industry",
      contractId: `industry.${industryOverlay.overlayId}`,
      version: industryOverlay.version,
      action: "add",
    });
    layerVersions.push({
      layer: "industry",
      version: industryOverlay.version,
      contractId: `industry.${industryOverlay.overlayId}`,
    });
  }

  if (input.brandRequirements?.length) {
    hardRequirements = mergeRequirements(hardRequirements, input.brandRequirements);
    brandRequirementIds = input.brandRequirements.map((r) => r.id);
    trace.push({
      layer: "brand",
      contractId: "brand.runtime",
      version: "runtime",
      action: "add",
      requirementIds: brandRequirementIds,
    });
    layerVersions.push({
      layer: "brand",
      version: "runtime",
      contractId: "brand.runtime",
    });
  }

  if (input.userTaskRequirements?.length) {
    hardRequirements = mergeRequirements(hardRequirements, input.userTaskRequirements);
    userTaskRequirementIds = input.userTaskRequirements.map((r) => r.id);
    trace.push({
      layer: "user_task",
      contractId: "user_task.runtime",
      version: "runtime",
      action: "add",
      requirementIds: userTaskRequirementIds,
    });
    layerVersions.push({
      layer: "user_task",
      version: "runtime",
      contractId: "user_task.runtime",
    });
  }

  const effectiveContractId = [
    base.contractId,
    input.platform,
    input.format,
    industryOverlayId,
    brandRequirementIds?.length ? "brand" : undefined,
    userTaskRequirementIds?.length ? "task" : undefined,
  ]
    .filter(Boolean)
    .join(":");

  const identity: EffectiveContractIdentity = Object.freeze({
    effectiveContractId,
    systemVersion: OUTPUT_CONTRACT_SYSTEM_VERSION,
    serviceKey: `${input.service}/${input.subtype}`,
    outputKind: base.outputKind,
    layerVersions: Object.freeze(layerVersions),
    composedAt: nowIso(),
  });

  return Object.freeze({
    ...base,
    hardRequirements,
    qualityRequirements,
    identity,
    compositionTrace: Object.freeze(trace),
    industryOverlayId,
    brandRequirementIds: brandRequirementIds
      ? Object.freeze(brandRequirementIds)
      : undefined,
    userTaskRequirementIds: userTaskRequirementIds
      ? Object.freeze(userTaskRequirementIds)
      : undefined,
    provenance: Object.freeze([
      ...base.provenance,
      ...(industryOverlayId
        ? [{ source: "industry_overlay" as const, reference: industryOverlayId }]
        : []),
      ...(brandRequirementIds?.length
        ? [{ source: "brand" as const, reference: "runtime" }]
        : []),
      ...(userTaskRequirementIds?.length
        ? [{ source: "user_task" as const, reference: "runtime" }]
        : []),
    ]),
  });
}

/** Detect requirement conflicts — same id with incompatible evaluation specs. */
export function detectRequirementConflicts(
  requirements: readonly ContractRequirement[],
): readonly string[] {
  const conflicts: string[] = [];
  const byId = new Map<string, ContractRequirement>();
  for (const req of requirements) {
    const existing = byId.get(req.id);
    if (
      existing &&
      existing.evaluation.expectedResult !== req.evaluation.expectedResult
    ) {
      conflicts.push(
        `Conflict on ${req.id}: "${existing.evaluation.expectedResult}" vs "${req.evaluation.expectedResult}"`,
      );
    }
    byId.set(req.id, req);
  }
  return Object.freeze(conflicts);
}

/** List all service/subtype keys from SERVICE_OUTPUT_MAP (excluding wildcards for coverage). */
export function enumerateServiceKeys(): readonly string[] {
  return Object.freeze(
    Object.keys(SERVICE_OUTPUT_MAP).filter((k) => !k.endsWith("/*")),
  );
}

export function isDynamicServiceKey(serviceKey: string): boolean {
  const spec = SERVICE_OUTPUT_MAP[serviceKey as keyof typeof SERVICE_OUTPUT_MAP];
  return spec?.kind === "dynamic";
}
