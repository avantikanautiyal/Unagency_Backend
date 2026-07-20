/**
 * Production Validation Platform factory.
 */

import {
  ProductionValidationEngine,
  type ProductionValidationEngineDeps,
} from "../validation/production-validation-engine";
import type { IProductionValidationEngine } from "../interfaces/production";
import { InMemoryProductionReportStore } from "../reporting/report-store";

export interface ProductionValidationPlatform {
  readonly engine: IProductionValidationEngine;
  readonly reportStore: InMemoryProductionReportStore;
}

export type CreateProductionValidationOptions = ProductionValidationEngineDeps;

export function createProductionValidationPlatform(
  options: CreateProductionValidationOptions = {}
): ProductionValidationPlatform {
  const reportStore = options.reportStore ?? new InMemoryProductionReportStore();
  const engine = new ProductionValidationEngine({
    ...options,
    reportStore,
  });
  return { engine, reportStore };
}
