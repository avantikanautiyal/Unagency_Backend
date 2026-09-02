/**
 * Canonical Output Contract system versioning.
 * Every effective contract carries these identifiers for traceability.
 */

export const OUTPUT_CONTRACT_SYSTEM_VERSION = "1.0.0" as const;
export const OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION = "1.0.0" as const;
export const OUTPUT_CONTRACT_GLOBAL_RULES_VERSION = "1.0.0" as const;
export const OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION = "1.0.0" as const;

export type ContractLayerVersion = {
  readonly layer: ContractCompositionLayer;
  readonly version: string;
  readonly contractId: string;
};

export type ContractCompositionLayer =
  | "global"
  | "kind"
  | "service"
  | "format"
  | "industry"
  | "brand"
  | "user_task";

export type EffectiveContractIdentity = {
  readonly effectiveContractId: string;
  readonly systemVersion: typeof OUTPUT_CONTRACT_SYSTEM_VERSION;
  readonly serviceKey: string;
  readonly outputKind: string;
  readonly layerVersions: readonly ContractLayerVersion[];
  readonly composedAt: string;
};
