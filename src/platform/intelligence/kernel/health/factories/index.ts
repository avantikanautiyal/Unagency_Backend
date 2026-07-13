/**
 * Health factory contracts.
 * Concrete construction remains in lifecycle / composition (foundation).
 */

import type { IHealthMonitor, IHealthRegistry } from "../interfaces/health";

export interface IHealthRegistryFactory {
  create(): IHealthRegistry;
}

export interface IHealthMonitorFactory {
  create(): IHealthMonitor;
}
