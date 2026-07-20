/** Branded capability-intelligence identifiers. */

export type CapabilityBundleId = string & { readonly __brand: "CapabilityBundleId" };
export type CapabilityExecutionPlanId = string & {
  readonly __brand: "CapabilityExecutionPlanId";
};
export type CapabilityIntelligenceResultId = string & {
  readonly __brand: "CapabilityIntelligenceResultId";
};
export type CapabilityGraphId = string & { readonly __brand: "CapabilityGraphId" };

export function asCapabilityBundleId(id: string): CapabilityBundleId {
  return id as CapabilityBundleId;
}

export function asCapabilityExecutionPlanId(id: string): CapabilityExecutionPlanId {
  return id as CapabilityExecutionPlanId;
}

export function asCapabilityIntelligenceResultId(id: string): CapabilityIntelligenceResultId {
  return id as CapabilityIntelligenceResultId;
}

export function asCapabilityGraphId(id: string): CapabilityGraphId {
  return id as CapabilityGraphId;
}
