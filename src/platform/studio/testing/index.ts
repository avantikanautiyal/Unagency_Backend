/**
 * Studio Engine testing helpers.
 */

import {
  createStudioPlatform,
  type CreateStudioPlatformOptions,
  type StudioPlatform,
} from "../factories/create-studio-platform";
import {
  StudioAiSessionBuilder,
  StudioWorkspaceBuilder,
} from "../builders/studio-builders";

export function deterministicStudioHelpers() {
  let id = 0;
  let ms = 90_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 11),
  };
}

export function setupStudio(
  options: CreateStudioPlatformOptions = {}
): StudioPlatform {
  const h = deterministicStudioHelpers();
  return createStudioPlatform({
    createId: h.createId,
    nowIso: h.nowIso,
    clockMs: h.clockMs,
    organizationId: "org_test",
    ...options,
  });
}

export { StudioWorkspaceBuilder, StudioAiSessionBuilder };
