/**
 * Studio Engine — product interaction layer for all future UNAGENCY apps.
 *
 * Framework-agnostic. No React / React Native / HTML / CSS.
 * Communicates only via Enterprise API Gateway request envelopes.
 * Never talks directly to Intelligence OS, providers, runtime, or persistence.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../intelligence/shared/errors";
import type {
  StudioActivity,
  StudioAiSession,
  StudioCanvas,
  StudioCommand,
  StudioExtensionManifest,
  StudioGatewayRequest,
  StudioHistoryEntry,
  StudioPanel,
  StudioSnapshot,
  StudioState,
  StudioStateDiff,
  StudioTypeId,
  StudioWidgetDescriptor,
  StudioWorkspace,
} from "../contracts";
import type { IStudioEngine } from "../interfaces";
import { cloneState, diffStates, emptyStudioState } from "../state/studio-state";
import {
  STUDIO_TYPE_CONFIGS,
  buildDefaultLayout,
  studioDefinitionFromType,
} from "../templates/studio-types";

export interface StudioEngineDeps {
  readonly organizationId?: string;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly maxHistory?: number;
}

export class StudioEngine implements IStudioEngine {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;
  private readonly maxHistory: number;
  private state: StudioState;
  private undoStack: StudioHistoryEntry[] = [];
  private redoStack: StudioHistoryEntry[] = [];
  private snapshots: StudioSnapshot[] = [];

  constructor(deps: StudioEngineDeps = {}) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    const clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${clockMs()}`);
    this.maxHistory = deps.maxHistory ?? 100;
    this.state = emptyStudioState(deps.organizationId ?? "org_pending", this.nowIso());
  }

  getState(): StudioState {
    return this.state;
  }

  dispatch(command: StudioCommand): Result<StudioState> {
    if (command.kind === "undo") return this.undo();
    if (command.kind === "redo") return this.redo();
    if (command.kind === "create_snapshot") {
      return this.createSnapshot(command.label);
    }
    if (command.kind === "restore_snapshot") {
      return this.restoreSnapshot(command.snapshotId);
    }

    const before = cloneState(this.state);
    const applied = this.apply(command, cloneState(this.state));
    if (!applied.ok) return applied;

    this.pushHistory(before, command.kind);
    this.redoStack = [];
    this.state = {
      ...applied.value,
      revision: before.revision + 1,
      updatedAt: this.nowIso(),
    };
    return success(this.state);
  }

  getWorkspace(workspaceId: string): Result<StudioWorkspace | undefined> {
    return success(this.state.workspaces[workspaceId]);
  }

  getCanvas(canvasId: string): Result<StudioCanvas | undefined> {
    return success(this.state.canvases[canvasId]);
  }

  getSession(sessionId: string): Result<StudioAiSession | undefined> {
    return success(this.state.sessions[sessionId]);
  }

  listActivities(workspaceId: string): Result<readonly StudioActivity[]> {
    const timeline = Object.values(this.state.timelines).find(
      (t) => t.workspaceId === workspaceId
    );
    if (!timeline) return success([]);
    return success(
      timeline.activityIds
        .map((id) => this.state.activities[id])
        .filter((a): a is StudioActivity => Boolean(a))
    );
  }

  listWidgets(): Result<readonly StudioWidgetDescriptor[]> {
    return success(Object.values(this.state.widgets));
  }

  listExtensions(): Result<readonly StudioExtensionManifest[]> {
    return success(Object.values(this.state.extensions));
  }

  listStudioTypes(): Result<readonly StudioTypeId[]> {
    return success(Object.keys(STUDIO_TYPE_CONFIGS) as StudioTypeId[]);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  listHistory(): Result<readonly StudioHistoryEntry[]> {
    return success([...this.undoStack]);
  }

  listSnapshots(): Result<readonly StudioSnapshot[]> {
    return success([...this.snapshots]);
  }

  compareRevisions(
    fromRevision: number,
    toRevision: number
  ): Result<StudioStateDiff> {
    const from =
      this.undoStack.find((h) => h.revision === fromRevision)?.state ??
      (this.state.revision === fromRevision ? this.state : undefined);
    const to =
      this.undoStack.find((h) => h.revision === toRevision)?.state ??
      (this.state.revision === toRevision ? this.state : undefined) ??
      this.snapshots.find((s) => s.revision === toRevision)?.state;
    if (!from || !to) {
      return failure(new NotFoundError("revision not found in history/snapshots"));
    }
    return success({
      fromRevision,
      toRevision,
      changedKeys: diffStates(from, to),
    });
  }

  buildExecutionGatewayRequest(input: {
    organizationId: string;
    accessTokenRef: string;
    prompt: string;
    sessionId?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }): Result<StudioGatewayRequest> {
    if (!input.accessTokenRef.trim()) {
      return failure(new ValidationError("accessTokenRef required"));
    }
    return success({
      channel: "enterprise_api_gateway",
      method: "POST",
      path: "/v1/executions",
      organizationId: input.organizationId,
      accessTokenRef: input.accessTokenRef,
      body: {
        prompt: input.prompt,
        organizationId: input.organizationId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      },
      metadata: {
        source: "studio_engine",
        ...(input.metadata ?? {}),
      },
    });
  }

  private undo(): Result<StudioState> {
    const entry = this.undoStack.pop();
    if (!entry) return failure(new ValidationError("nothing to undo"));
    this.redoStack.push({
      entryId: this.createId("hist"),
      revision: this.state.revision,
      label: "redo-point",
      commandKind: "undo",
      createdAt: this.nowIso(),
      state: cloneState(this.state),
    });
    this.state = cloneState(entry.state);
    return success(this.state);
  }

  private redo(): Result<StudioState> {
    const entry = this.redoStack.pop();
    if (!entry) return failure(new ValidationError("nothing to redo"));
    this.undoStack.push({
      entryId: this.createId("hist"),
      revision: this.state.revision,
      label: "undo-point",
      commandKind: "redo",
      createdAt: this.nowIso(),
      state: cloneState(this.state),
    });
    this.state = cloneState(entry.state);
    return success(this.state);
  }

  private createSnapshot(label: string): Result<StudioState> {
    this.snapshots.push({
      snapshotId: this.createId("snap"),
      label,
      revision: this.state.revision,
      createdAt: this.nowIso(),
      state: cloneState(this.state),
    });
    return success(this.state);
  }

  private restoreSnapshot(snapshotId: string): Result<StudioState> {
    const snap = this.snapshots.find((s) => s.snapshotId === snapshotId);
    if (!snap) return failure(new NotFoundError("snapshot not found"));
    const before = cloneState(this.state);
    this.pushHistory(before, "restore_snapshot");
    this.redoStack = [];
    this.state = {
      ...cloneState(snap.state),
      revision: before.revision + 1,
      updatedAt: this.nowIso(),
    };
    return success(this.state);
  }

  private pushHistory(before: StudioState, commandKind: string): void {
    this.undoStack.push({
      entryId: this.createId("hist"),
      revision: before.revision,
      label: commandKind,
      commandKind,
      createdAt: this.nowIso(),
      state: before,
    });
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
  }

  private apply(command: StudioCommand, draft: StudioState): Result<StudioState> {
    switch (command.kind) {
      case "create_workspace":
        return this.createWorkspace(draft, command);
      case "open_studio":
        return this.openStudio(draft, command);
      case "open_tab":
        return this.openTab(draft, command);
      case "set_active_tab":
        return this.setActiveTab(draft, command);
      case "upsert_canvas":
        return this.upsertCanvas(draft, command);
      case "set_panel_visibility":
        return this.setPanelVisibility(draft, command);
      case "start_ai_session":
        return this.startAiSession(draft, command);
      case "update_ai_session":
        return this.updateAiSession(draft, command);
      case "record_activity":
        return this.recordActivity(draft, command);
      case "add_comment":
        return this.addComment(draft, command);
      case "upsert_presence":
        return this.upsertPresence(draft, command);
      case "request_approval":
        return this.requestApproval(draft, command);
      case "resolve_approval":
        return this.resolveApproval(draft, command);
      case "create_document":
        return this.createDocument(draft, command);
      case "register_widget":
        return this.registerWidget(draft, command);
      case "register_extension":
        return this.registerExtension(draft, command);
      case "pin_item":
        return this.pinItem(draft, command);
      default:
        return failure(new ValidationError("unsupported command"));
    }
  }

  private createWorkspace(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "create_workspace" }>
  ): Result<StudioState> {
    if (!command.name.trim()) {
      return failure(new ValidationError("workspace name required"));
    }
    const cfg = STUDIO_TYPE_CONFIGS[command.studioType];
    if (!cfg) return failure(new ValidationError("unknown studio type"));

    const now = this.nowIso();
    draft = {
      ...draft,
      organizationId: command.organizationId,
    };

    const layoutId = this.createId("layout");
    const layout = buildDefaultLayout(layoutId, `${cfg.name} Layout`);

    const panels = this.buildDefaultPanels(cfg.panelTitles);
    const panelIds = panels.map((p) => p.panelId);
    const layoutWithPanels = {
      ...layout,
      regions: layout.regions.map((r) => {
        if (r.edge === "left") return { ...r, panelIds: [panels[0]!.panelId] };
        if (r.edge === "right") return { ...r, panelIds: [panels[1]!.panelId] };
        if (r.edge === "bottom") return { ...r, panelIds: [panels[2]!.panelId] };
        if (r.edge === "center") return { ...r, panelIds: [panels[3]!.panelId] };
        return r;
      }),
    };

    const widgets: StudioWidgetDescriptor[] = cfg.defaultWidgets.map((w) => ({
      widgetId: this.createId("widget"),
      ...w,
      metadata: {},
    }));

    const studioId = this.createId("studio");
    const studio = studioDefinitionFromType(
      studioId,
      command.studioType,
      layoutId,
      widgets.map((w) => w.widgetId)
    );

    const viewId = this.createId("view");
    const canvasId = this.createId("canvas");
    const sectionId = this.createId("section");
    const blockId = this.createId("block");
    const tabId = this.createId("tab");
    const projectId = this.createId("project");
    const workspaceId = this.createId("ws");
    const timelineId = this.createId("timeline");

    const canvas: StudioCanvas = {
      canvasId,
      workspaceId,
      name: `${command.name} Canvas`,
      sectionIds: [sectionId],
      panelIds,
      toolbarPanelId: panels[4]?.panelId,
      sidebarPanelId: panels[0]!.panelId,
      inspectorPanelId: panels[1]!.panelId,
      bottomPanelId: panels[2]!.panelId,
      splitViewEnabled: false,
      metadata: {},
      updatedAt: now,
    };

    const workspace: StudioWorkspace = {
      workspaceId,
      organizationId: command.organizationId,
      name: command.name,
      description: command.description,
      projectIds: [projectId],
      studioIds: [studioId],
      activeStudioId: studioId,
      openTabIds: [tabId],
      activeTabId: tabId,
      pinned: [],
      favorites: [],
      layoutId,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    return success({
      ...draft,
      workspaces: { ...draft.workspaces, [workspaceId]: workspace },
      projects: {
        ...draft.projects,
        [projectId]: {
          projectId,
          workspaceId,
          name: `${command.name} Project`,
          campaignIds: [],
          studioIds: [studioId],
          createdAt: now,
          updatedAt: now,
        },
      },
      studios: { ...draft.studios, [studioId]: studio },
      layouts: { ...draft.layouts, [layoutId]: layoutWithPanels },
      panels: {
        ...draft.panels,
        ...Object.fromEntries(panels.map((p) => [p.panelId, p])),
      },
      widgets: {
        ...draft.widgets,
        ...Object.fromEntries(widgets.map((w) => [w.widgetId, w])),
      },
      views: {
        ...draft.views,
        [viewId]: {
          viewId,
          name: cfg.name,
          layoutId,
          canvasId,
          widgetIds: widgets.map((w) => w.widgetId),
          metadata: {},
        },
      },
      tabs: {
        ...draft.tabs,
        [tabId]: {
          tabId,
          title: cfg.name,
          viewId,
          closable: false,
          dirty: false,
        },
      },
      canvases: { ...draft.canvases, [canvasId]: canvas },
      sections: {
        ...draft.sections,
        [sectionId]: {
          sectionId,
          title: "Main",
          order: 0,
          blockIds: [blockId],
          collapsed: false,
        },
      },
      blocks: {
        ...draft.blocks,
        [blockId]: {
          blockId,
          kind: "placeholder",
          title: "Start",
          order: 0,
          props: {},
          childBlockIds: [],
        },
      },
      timelines: {
        ...draft.timelines,
        [timelineId]: {
          timelineId,
          workspaceId,
          activityIds: [],
          updatedAt: now,
        },
      },
      activeWorkspaceId: workspaceId,
    });
  }

  private buildDefaultPanels(titles: {
    sidebar: string;
    inspector: string;
    bottom: string;
  }): StudioPanel[] {
    const mk = (
      kind: StudioPanel["kind"],
      title: string,
      dock: StudioPanel["dock"],
      order: number
    ): StudioPanel => ({
      panelId: this.createId("panel"),
      kind,
      title,
      dock,
      visible: true,
      order,
      widgetIds: [],
      props: {},
    });
    return [
      mk("sidebar", titles.sidebar, "left", 0),
      mk("inspector", titles.inspector, "right", 1),
      mk("bottom", titles.bottom, "bottom", 2),
      mk("canvas", "Canvas", "center", 3),
      mk("toolbar", "Toolbar", "top", 4),
    ];
  }

  private openStudio(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "open_studio" }>
  ): Result<StudioState> {
    const ws = draft.workspaces[command.workspaceId];
    if (!ws) return failure(new NotFoundError("workspace not found"));
    const existing = Object.values(draft.studios).find(
      (s) => s.type === command.studioType && ws.studioIds.includes(s.studioId)
    );
    if (existing) {
      return success({
        ...draft,
        workspaces: {
          ...draft.workspaces,
          [ws.workspaceId]: {
            ...ws,
            activeStudioId: existing.studioId,
            updatedAt: this.nowIso(),
          },
        },
      });
    }
    // Spawn additional studio config into workspace
    const created = this.createWorkspace(draft, {
      kind: "create_workspace",
      organizationId: ws.organizationId,
      name: `${ws.name} / ${STUDIO_TYPE_CONFIGS[command.studioType].name}`,
      studioType: command.studioType,
    });
    if (!created.ok) return created;
    const newWsId = created.value.activeWorkspaceId!;
    const newWs = created.value.workspaces[newWsId]!;
    const studioId = newWs.activeStudioId!;
    // Merge studio artifacts into original workspace instead of replacing active
    return success({
      ...created.value,
      workspaces: {
        ...created.value.workspaces,
        [ws.workspaceId]: {
          ...ws,
          studioIds: [...ws.studioIds, studioId],
          activeStudioId: studioId,
          updatedAt: this.nowIso(),
        },
      },
      activeWorkspaceId: ws.workspaceId,
    });
  }

  private openTab(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "open_tab" }>
  ): Result<StudioState> {
    const ws = draft.workspaces[command.workspaceId];
    if (!ws) return failure(new NotFoundError("workspace not found"));
    const tabId = this.createId("tab");
    const viewId = command.viewId ?? Object.keys(draft.views)[0];
    if (!viewId || !draft.views[viewId]) {
      return failure(new ValidationError("view required to open tab"));
    }
    return success({
      ...draft,
      tabs: {
        ...draft.tabs,
        [tabId]: {
          tabId,
          title: command.title,
          viewId,
          closable: true,
          dirty: false,
        },
      },
      workspaces: {
        ...draft.workspaces,
        [ws.workspaceId]: {
          ...ws,
          openTabIds: [...ws.openTabIds, tabId],
          activeTabId: tabId,
          updatedAt: this.nowIso(),
        },
      },
    });
  }

  private setActiveTab(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "set_active_tab" }>
  ): Result<StudioState> {
    const ws = draft.workspaces[command.workspaceId];
    if (!ws) return failure(new NotFoundError("workspace not found"));
    if (!ws.openTabIds.includes(command.tabId)) {
      return failure(new ValidationError("tab not open in workspace"));
    }
    return success({
      ...draft,
      workspaces: {
        ...draft.workspaces,
        [ws.workspaceId]: {
          ...ws,
          activeTabId: command.tabId,
          updatedAt: this.nowIso(),
        },
      },
    });
  }

  private upsertCanvas(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "upsert_canvas" }>
  ): Result<StudioState> {
    const ws = draft.workspaces[command.workspaceId];
    if (!ws) return failure(new NotFoundError("workspace not found"));
    const canvasId = command.canvasId ?? this.createId("canvas");
    const existing = draft.canvases[canvasId];
    const panelIds = existing?.panelIds ?? Object.keys(draft.panels).slice(0, 4);
    const canvas: StudioCanvas = {
      canvasId,
      workspaceId: command.workspaceId,
      name: command.name,
      sectionIds: existing?.sectionIds ?? [],
      panelIds,
      toolbarPanelId: existing?.toolbarPanelId,
      sidebarPanelId: existing?.sidebarPanelId,
      inspectorPanelId: existing?.inspectorPanelId,
      bottomPanelId: existing?.bottomPanelId,
      splitViewEnabled: existing?.splitViewEnabled ?? false,
      metadata: existing?.metadata ?? {},
      updatedAt: this.nowIso(),
    };
    return success({
      ...draft,
      canvases: { ...draft.canvases, [canvasId]: canvas },
    });
  }

  private setPanelVisibility(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "set_panel_visibility" }>
  ): Result<StudioState> {
    const panel = draft.panels[command.panelId];
    if (!panel) return failure(new NotFoundError("panel not found"));
    return success({
      ...draft,
      panels: {
        ...draft.panels,
        [panel.panelId]: { ...panel, visible: command.visible },
      },
    });
  }

  private startAiSession(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "start_ai_session" }>
  ): Result<StudioState> {
    const sessionId = this.createId("session");
    const now = this.nowIso();
    const session: StudioAiSession = {
      sessionId,
      organizationId: command.organizationId,
      title: command.title,
      status: "running",
      refs: command.refs,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    return success({
      ...draft,
      sessions: { ...draft.sessions, [sessionId]: session },
    });
  }

  private updateAiSession(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "update_ai_session" }>
  ): Result<StudioState> {
    const session = draft.sessions[command.sessionId];
    if (!session) return failure(new NotFoundError("session not found"));
    return success({
      ...draft,
      sessions: {
        ...draft.sessions,
        [session.sessionId]: {
          ...session,
          status: command.status,
          refs: {
            ...session.refs,
            ...(command.executionId
              ? { executionId: command.executionId }
              : {}),
          },
          updatedAt: this.nowIso(),
        },
      },
    });
  }

  private recordActivity(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "record_activity" }>
  ): Result<StudioState> {
    const timeline = Object.values(draft.timelines).find(
      (t) => t.workspaceId === command.workspaceId
    );
    if (!timeline) return failure(new NotFoundError("timeline not found"));
    const activityId = this.createId("act");
    const activity: StudioActivity = {
      activityId,
      workspaceId: command.workspaceId,
      kind: command.activityKind,
      actorId: command.actorId,
      actorKind: command.actorKind,
      summary: command.summary,
      targetKind: command.targetKind,
      targetId: command.targetId,
      occurredAt: this.nowIso(),
      metadata: command.metadata ?? {},
    };
    return success({
      ...draft,
      activities: { ...draft.activities, [activityId]: activity },
      timelines: {
        ...draft.timelines,
        [timeline.timelineId]: {
          ...timeline,
          activityIds: [...timeline.activityIds, activityId],
          updatedAt: this.nowIso(),
        },
      },
    });
  }

  private addComment(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "add_comment" }>
  ): Result<StudioState> {
    if (!draft.workspaces[command.workspaceId]) {
      return failure(new NotFoundError("workspace not found"));
    }
    const commentId = this.createId("cmt");
    const now = this.nowIso();
    return success({
      ...draft,
      comments: {
        ...draft.comments,
        [commentId]: {
          commentId,
          workspaceId: command.workspaceId,
          authorId: command.authorId,
          body: command.body,
          targetKind: command.targetKind,
          targetId: command.targetId,
          mentionUserIds: command.mentionUserIds ?? [],
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  }

  private upsertPresence(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "upsert_presence" }>
  ): Result<StudioState> {
    const presenceId = `presence_${command.workspaceId}_${command.userId}`;
    return success({
      ...draft,
      presence: {
        ...draft.presence,
        [presenceId]: {
          presenceId,
          workspaceId: command.workspaceId,
          userId: command.userId,
          status: command.status,
          viewId: command.viewId,
          updatedAt: this.nowIso(),
        },
      },
    });
  }

  private requestApproval(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "request_approval" }>
  ): Result<StudioState> {
    const approvalId = this.createId("apr");
    const now = this.nowIso();
    return success({
      ...draft,
      approvals: {
        ...draft.approvals,
        [approvalId]: {
          approvalId,
          workspaceId: command.workspaceId,
          title: command.title,
          requesterId: command.requesterId,
          reviewerIds: command.reviewerIds,
          status: "requested",
          targetKind: command.targetKind,
          targetId: command.targetId,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  }

  private resolveApproval(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "resolve_approval" }>
  ): Result<StudioState> {
    const approval = draft.approvals[command.approvalId];
    if (!approval) return failure(new NotFoundError("approval not found"));
    return success({
      ...draft,
      approvals: {
        ...draft.approvals,
        [approval.approvalId]: {
          ...approval,
          status: command.status,
          updatedAt: this.nowIso(),
        },
      },
    });
  }

  private createDocument(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "create_document" }>
  ): Result<StudioState> {
    if (!draft.workspaces[command.workspaceId]) {
      return failure(new NotFoundError("workspace not found"));
    }
    const documentId = this.createId("doc");
    const now = this.nowIso();
    return success({
      ...draft,
      documents: {
        ...draft.documents,
        [documentId]: {
          documentId,
          workspaceId: command.workspaceId,
          kind: command.kindDoc,
          title: command.title,
          bodyRef: command.bodyRef,
          version: 1,
          referenceIds: [],
          createdAt: now,
          updatedAt: now,
          metadata: {},
        },
      },
    });
  }

  private registerWidget(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "register_widget" }>
  ): Result<StudioState> {
    const widgetId = command.widget.widgetId ?? this.createId("widget");
    const widget: StudioWidgetDescriptor = {
      widgetId,
      kind: command.widget.kind,
      title: command.widget.title,
      dataBinding: command.widget.dataBinding ?? {},
      sizeHint: { w: 1, h: 1 },
      refreshPolicy: "manual",
      extensionId: command.widget.extensionId,
      metadata: {},
    };
    return success({
      ...draft,
      widgets: { ...draft.widgets, [widgetId]: widget },
    });
  }

  private registerExtension(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "register_extension" }>
  ): Result<StudioState> {
    const ext: StudioExtensionManifest = {
      extensionId: command.extension.extensionId,
      name: command.extension.name,
      version: command.extension.version,
      contributesWidgets: command.extension.contributesWidgets ?? [],
      contributesPanels: command.extension.contributesPanels ?? [],
      contributesShortcuts: command.extension.contributesShortcuts ?? [],
      enabled: true,
      metadata: {},
    };
    return success({
      ...draft,
      extensions: { ...draft.extensions, [ext.extensionId]: ext },
    });
  }

  private pinItem(
    draft: StudioState,
    command: Extract<StudioCommand, { kind: "pin_item" }>
  ): Result<StudioState> {
    const ws = draft.workspaces[command.workspaceId];
    if (!ws) return failure(new NotFoundError("workspace not found"));
    const pinId = this.createId("pin");
    return success({
      ...draft,
      workspaces: {
        ...draft.workspaces,
        [ws.workspaceId]: {
          ...ws,
          pinned: [
            ...ws.pinned,
            {
              pinId,
              targetKind: command.targetKind,
              targetId: command.targetId,
              label: command.label,
              pinnedAt: this.nowIso(),
            },
          ],
          updatedAt: this.nowIso(),
        },
      },
    });
  }
}
