export type ModelIntelligenceResultId = string & { readonly __brand: "ModelIntelligenceResultId" };
export type ModelDecisionRecordId = string & { readonly __brand: "ModelDecisionRecordId" };

export function asModelIntelligenceResultId(value: string): ModelIntelligenceResultId {
  if (!value.trim()) throw new Error("ModelIntelligenceResultId cannot be empty");
  return value as ModelIntelligenceResultId;
}

export function asModelDecisionRecordId(value: string): ModelDecisionRecordId {
  if (!value.trim()) throw new Error("ModelDecisionRecordId cannot be empty");
  return value as ModelDecisionRecordId;
}
