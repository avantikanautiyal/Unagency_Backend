/**
 * Empty immutable Studio state factory.
 */

import type { StudioState } from "../contracts";

export function emptyStudioState(
  organizationId: string,
  updatedAt: string
): StudioState {
  return {
    revision: 0,
    organizationId,
    workspaces: {},
    projects: {},
    campaigns: {},
    studios: {},
    tabs: {},
    views: {},
    layouts: {},
    canvases: {},
    panels: {},
    sections: {},
    blocks: {},
    sessions: {},
    activities: {},
    timelines: {},
    tasks: {},
    documents: {},
    assets: {},
    widgets: {},
    comments: {},
    presence: {},
    approvals: {},
    notifications: {},
    extensions: {},
    shortcuts: {},
    updatedAt,
  };
}

export function cloneState(state: StudioState): StudioState {
  return JSON.parse(JSON.stringify(state)) as StudioState;
}

export function diffStates(from: StudioState, to: StudioState): readonly string[] {
  const keys = new Set([
    ...Object.keys(from),
    ...Object.keys(to),
  ]);
  const changed: string[] = [];
  for (const key of keys) {
    const a = (from as Record<string, unknown>)[key];
    const b = (to as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(key);
  }
  return changed;
}
