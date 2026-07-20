/** Branded consensus identifiers. */

export type ConsensusResultId = string & { readonly __brand: "ConsensusResultId" };

export function asConsensusResultId(id: string): ConsensusResultId {
  return id as ConsensusResultId;
}
