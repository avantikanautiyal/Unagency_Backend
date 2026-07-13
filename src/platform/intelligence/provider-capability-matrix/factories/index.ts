/**
 * Factory contracts for the provider capability matrix.
 * No implementations in architecture phase.
 */

import type { IProviderCapabilityMatrix } from "../interfaces/provider-capability-matrix";

export interface IProviderCapabilityMatrixFactory {
  create(): IProviderCapabilityMatrix;
}
