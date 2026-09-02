/**
 * Factory — wires provider runtime into direct execution engine.
 */

import { createProviderRuntime } from "../providers/runtime/factories/create-provider-runtime";
import type { IProviderDispatcher } from "../providers/runtime/interfaces/provider-dispatcher";
import type { ToolRuntimePlatform } from "../providers/tools/composition/tool-runtime-platform";
import {
  createDirectExecutionEngine,
  type DirectExecutionEngineDeps,
} from "./direct-execution-engine";
import type { IDirectExecutionEngine } from "./contracts";

export interface DirectExecutionPlatformOptions {
  readonly runtimeDispatcher: IProviderDispatcher;
  readonly toolRuntime?: ToolRuntimePlatform;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export interface DirectExecutionPlatform {
  readonly engine: IDirectExecutionEngine;
}

export function createDirectExecutionPlatform(
  options: DirectExecutionPlatformOptions
): DirectExecutionPlatform {
  const clocks = {
    nowIso: options.nowIso ?? (() => new Date().toISOString()),
    clockMs: options.clockMs ?? (() => Date.now()),
    createId: options.createId ?? ((p: string) => `${p}_${Date.now()}`),
  };

  const runtime =
    options.toolRuntime?.runtime ??
    createProviderRuntime({
      dispatcher: options.runtimeDispatcher,
      nowIso: clocks.nowIso,
      nowMs: clocks.clockMs,
      createId: clocks.createId,
    });

  const engine = createDirectExecutionEngine({
    runtime,
    toolRuntime: options.toolRuntime,
    ...clocks,
  });

  return { engine };
}
