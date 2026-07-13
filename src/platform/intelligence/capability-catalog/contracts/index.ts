export * from "./catalog-query";

/** Re-export definition model from registry (catalog does not own it). */
export type {
  CapabilityDefinition,
  CapabilitySchema,
  CapabilityModality,
  CapabilityVisibility,
  CapabilitySecurityClassification,
} from "../../capability-registry/contracts/capability-definition";
