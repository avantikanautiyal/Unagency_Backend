/**
 * Immutable Studio state, history, undo/redo, snapshots.
 */

import type { StudioCanvas } from "./canvas";
import type { StudioTimeline, StudioActivity, StudioTask } from "./activity";
import type { StudioAiSession } from "./session";
import type {
  StudioWorkspace,
  StudioProject,
  StudioDefinition,
  StudioTab,
  StudioView,
  StudioLayout,
  StudioCampaignRef,
} from "./workspace";
import type { StudioPanel, StudioSection, StudioBlock } from "./canvas";
import type {
  StudioComment,
  StudioPresence,
  StudioApprovalRequest,
  StudioNotification,
} from "./collaboration";
import type {
  StudioDocument,
  StudioAsset,
  StudioWidgetDescriptor,
  StudioExtensionManifest,
  StudioShortcut,
} from "./widgets";

export interface StudioState {
  readonly revision: number;
  readonly organizationId: string;
  readonly workspaces: Readonly<Record<string, StudioWorkspace>>;
  readonly projects: Readonly<Record<string, StudioProject>>;
  readonly campaigns: Readonly<Record<string, StudioCampaignRef>>;
  readonly studios: Readonly<Record<string, StudioDefinition>>;
  readonly tabs: Readonly<Record<string, StudioTab>>;
  readonly views: Readonly<Record<string, StudioView>>;
  readonly layouts: Readonly<Record<string, StudioLayout>>;
  readonly canvases: Readonly<Record<string, StudioCanvas>>;
  readonly panels: Readonly<Record<string, StudioPanel>>;
  readonly sections: Readonly<Record<string, StudioSection>>;
  readonly blocks: Readonly<Record<string, StudioBlock>>;
  readonly sessions: Readonly<Record<string, StudioAiSession>>;
  readonly activities: Readonly<Record<string, StudioActivity>>;
  readonly timelines: Readonly<Record<string, StudioTimeline>>;
  readonly tasks: Readonly<Record<string, StudioTask>>;
  readonly documents: Readonly<Record<string, StudioDocument>>;
  readonly assets: Readonly<Record<string, StudioAsset>>;
  readonly widgets: Readonly<Record<string, StudioWidgetDescriptor>>;
  readonly comments: Readonly<Record<string, StudioComment>>;
  readonly presence: Readonly<Record<string, StudioPresence>>;
  readonly approvals: Readonly<Record<string, StudioApprovalRequest>>;
  readonly notifications: Readonly<Record<string, StudioNotification>>;
  readonly extensions: Readonly<Record<string, StudioExtensionManifest>>;
  readonly shortcuts: Readonly<Record<string, StudioShortcut>>;
  readonly activeWorkspaceId?: string;
  readonly updatedAt: string;
}

export interface StudioHistoryEntry {
  readonly entryId: string;
  readonly revision: number;
  readonly label: string;
  readonly commandKind: string;
  readonly createdAt: string;
  readonly state: StudioState;
}

export interface StudioSnapshot {
  readonly snapshotId: string;
  readonly label: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly state: StudioState;
}

export interface StudioStateDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedKeys: readonly string[];
}
