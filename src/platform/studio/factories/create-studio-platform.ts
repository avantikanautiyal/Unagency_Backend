/**
 * Studio Engine platform factory.
 */

import {
  StudioEngine,
  type StudioEngineDeps,
} from "../engine/studio-engine";
import type { IStudioEngine } from "../interfaces";

export interface StudioPlatform {
  readonly engine: IStudioEngine;
}

export type CreateStudioPlatformOptions = StudioEngineDeps;

export function createStudioPlatform(
  options: CreateStudioPlatformOptions = {}
): StudioPlatform {
  return {
    engine: new StudioEngine(options),
  };
}
