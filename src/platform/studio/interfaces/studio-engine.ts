/**
 * Studio Engine public interfaces.
 */

import type { Result } from "../../intelligence/shared/result";
import type {
  StudioCommand,
  StudioGatewayRequest,
  StudioHistoryEntry,
  StudioSnapshot,
  StudioState,
  StudioStateDiff,
  StudioTypeId,
  StudioWorkspace,
  StudioCanvas,
  StudioAiSession,
  StudioActivity,
  StudioWidgetDescriptor,
  StudioExtensionManifest,
} from "../contracts";

export interface IStudioEngine {
  getState(): StudioState;
  dispatch(command: StudioCommand): Result<StudioState>;

  getWorkspace(workspaceId: string): Result<StudioWorkspace | undefined>;
  getCanvas(canvasId: string): Result<StudioCanvas | undefined>;
  getSession(sessionId: string): Result<StudioAiSession | undefined>;
  listActivities(workspaceId: string): Result<readonly StudioActivity[]>;
  listWidgets(): Result<readonly StudioWidgetDescriptor[]>;
  listExtensions(): Result<readonly StudioExtensionManifest[]>;
  listStudioTypes(): Result<readonly StudioTypeId[]>;

  canUndo(): boolean;
  canRedo(): boolean;
  listHistory(): Result<readonly StudioHistoryEntry[]>;
  listSnapshots(): Result<readonly StudioSnapshot[]>;
  compareRevisions(fromRevision: number, toRevision: number): Result<StudioStateDiff>;

  /** Build Gateway request envelopes — never call OS/providers directly. */
  buildExecutionGatewayRequest(input: {
    organizationId: string;
    accessTokenRef: string;
    prompt: string;
    sessionId?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }): Result<StudioGatewayRequest>;
}
