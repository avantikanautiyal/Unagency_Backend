/**
 * Mock interface markers for future contract tests.
 * No test implementations in M0.
 */

import type { IEventBus } from "../../events";
import type { IIntelligenceKernel } from "../../kernel";
import type { IPlatformRegistries } from "../../kernel/registry";
import type { ITelemetry } from "../../telemetry";

export interface IMockEventBus extends IEventBus {
  readonly published: readonly unknown[];
}

export interface IMockTelemetry extends ITelemetry {
  readonly recordedExecutions: readonly unknown[];
}

export interface IMockPlatformRegistries extends IPlatformRegistries {}

export interface IMockKernel extends IIntelligenceKernel {}
