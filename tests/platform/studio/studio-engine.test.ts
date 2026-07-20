import {
  setupStudio,
  StudioWorkspaceBuilder,
  StudioAiSessionBuilder,
} from "../../../src/platform/studio/testing";
import {
  assertNoDirectBackendPaths,
  isGatewayOnlyChannel,
} from "../../../src/platform/studio/ai/gateway-integration";
import { STUDIO_TYPE_CONFIGS } from "../../../src/platform/studio/templates/studio-types";

describe("UNAGENCY Studio Engine", () => {
  it("creates workspace lifecycle with studio, tabs, layout, panels", () => {
    const { engine } = setupStudio();
    const created = engine.dispatch(
      StudioWorkspaceBuilder.create()
        .forOrganization("org_1")
        .named("Launch Hub")
        .withStudioType("marketing")
        .build()
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const wsId = created.value.activeWorkspaceId!;
    const ws = engine.getWorkspace(wsId);
    expect(ws.ok && ws.value?.name).toBe("Launch Hub");
    expect(ws.ok && ws.value?.openTabIds.length).toBe(1);
    expect(Object.keys(created.value.panels).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(created.value.layouts).length).toBe(1);
    expect(Object.keys(created.value.studios).length).toBe(1);
  });

  it("supports canvas upsert and panel visibility", () => {
    const { engine } = setupStudio();
    const created = engine.dispatch({
      kind: "create_workspace",
      organizationId: "org_1",
      name: "Canvas WS",
      studioType: "content",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const wsId = created.value.activeWorkspaceId!;
    const canvasId = Object.keys(created.value.canvases)[0]!;
    const panelId = Object.keys(created.value.panels)[0]!;

    const renamed = engine.dispatch({
      kind: "upsert_canvas",
      workspaceId: wsId,
      canvasId,
      name: "Editor Canvas",
    });
    expect(renamed.ok && renamed.value.canvases[canvasId]?.name).toBe(
      "Editor Canvas"
    );

    const hidden = engine.dispatch({
      kind: "set_panel_visibility",
      panelId,
      visible: false,
    });
    expect(hidden.ok && hidden.value.panels[panelId]?.visible).toBe(false);
  });

  it("manages AI sessions without provider-specific fields", () => {
    const { engine } = setupStudio();
    const ws = engine.dispatch({
      kind: "create_workspace",
      organizationId: "org_1",
      name: "AI WS",
      studioType: "brand",
    });
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    const workspaceId = ws.value.activeWorkspaceId!;

    const started = engine.dispatch(
      StudioAiSessionBuilder.create()
        .forOrganization("org_1")
        .titled("Tone draft")
        .withRefs({
          workspaceId,
          capabilityId: "brand.tone",
          brandId: "brand_1",
          knowledgeContextId: "kctx_1",
          historyEntryIds: [],
        })
        .build()
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = Object.keys(started.value.sessions)[0]!;
    const session = started.value.sessions[sessionId]!;
    expect(session.status).toBe("running");
    expect(JSON.stringify(session)).not.toMatch(/openai|anthropic|provider/i);

    const updated = engine.dispatch({
      kind: "update_ai_session",
      sessionId,
      status: "completed",
      executionId: "exec_1",
    });
    expect(updated.ok && updated.value.sessions[sessionId]?.refs.executionId).toBe(
      "exec_1"
    );
  });

  it("records activities on the timeline", () => {
    const { engine } = setupStudio();
    const ws = engine.dispatch({
      kind: "create_workspace",
      organizationId: "org_1",
      name: "Timeline WS",
      studioType: "approval",
    });
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    const workspaceId = ws.value.activeWorkspaceId!;

    engine.dispatch({
      kind: "record_activity",
      workspaceId,
      activityKind: "user_action",
      actorId: "user_1",
      actorKind: "user",
      summary: "Opened approval queue",
    });
    engine.dispatch({
      kind: "record_activity",
      workspaceId,
      activityKind: "ai_action",
      actorId: "ai",
      actorKind: "ai",
      summary: "Generated review summary",
      targetKind: "document",
      targetId: "doc_1",
    });

    const acts = engine.listActivities(workspaceId);
    expect(acts.ok && acts.value.length).toBe(2);
    expect(acts.ok && acts.value[1]?.kind).toBe("ai_action");
  });

  it("supports history undo/redo and snapshots", () => {
    const { engine } = setupStudio();
    engine.dispatch({
      kind: "create_workspace",
      organizationId: "org_1",
      name: "History WS",
      studioType: "analytics",
    });
    const wsId = engine.getState().activeWorkspaceId!;
    engine.dispatch({
      kind: "pin_item",
      workspaceId: wsId,
      targetKind: "view",
      targetId: "view_x",
      label: "Dash",
    });
    expect(engine.getWorkspace(wsId).ok && engine.getWorkspace(wsId).value!.pinned.length).toBe(
      1
    );
    expect(engine.canUndo()).toBe(true);

    engine.dispatch({ kind: "undo" });
    expect(engine.getWorkspace(wsId).ok && engine.getWorkspace(wsId).value!.pinned.length).toBe(
      0
    );
    expect(engine.canRedo()).toBe(true);

    engine.dispatch({ kind: "redo" });
    expect(engine.getWorkspace(wsId).ok && engine.getWorkspace(wsId).value!.pinned.length).toBe(
      1
    );

    engine.dispatch({ kind: "create_snapshot", label: "checkpoint" });
    const snaps = engine.listSnapshots();
    expect(snaps.ok && snaps.value.length).toBe(1);

    engine.dispatch({
      kind: "pin_item",
      workspaceId: wsId,
      targetKind: "document",
      targetId: "d1",
      label: "Brief",
    });
    engine.dispatch({
      kind: "restore_snapshot",
      snapshotId: snaps.ok ? snaps.value[0]!.snapshotId : "",
    });
    expect(engine.getWorkspace(wsId).ok && engine.getWorkspace(wsId).value!.pinned.length).toBe(
      1
    );
  });

  it("registers widgets and extensions without engine changes", () => {
    const { engine } = setupStudio();
    engine.dispatch({
      kind: "register_extension",
      extension: {
        extensionId: "ext_custom",
        name: "Custom Pack",
        version: "1.0.0",
        contributesWidgets: ["custom"],
        contributesPanels: ["custom_panel"],
      },
    });
    engine.dispatch({
      kind: "register_widget",
      widget: {
        kind: "custom",
        title: "My Widget",
        extensionId: "ext_custom",
        dataBinding: { source: "gateway" },
      },
    });
    const widgets = engine.listWidgets();
    const exts = engine.listExtensions();
    expect(exts.ok && exts.value[0]?.extensionId).toBe("ext_custom");
    expect(widgets.ok && widgets.value.some((w) => w.kind === "custom")).toBe(true);
  });

  it("exposes all canonical studio types as configurations", () => {
    const { engine } = setupStudio();
    const types = engine.listStudioTypes();
    expect(types.ok && types.value.length).toBe(Object.keys(STUDIO_TYPE_CONFIGS).length);
    expect(types.ok && types.value).toEqual(
      expect.arrayContaining([
        "marketing",
        "brand",
        "website",
        "knowledge",
        "approval",
        "admin",
      ])
    );
  });

  it("builds Gateway-only execution requests", () => {
    const { engine } = setupStudio();
    const req = engine.buildExecutionGatewayRequest({
      organizationId: "org_1",
      accessTokenRef: "token_ref",
      prompt: "Draft a campaign intro",
      sessionId: "session_1",
    });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(isGatewayOnlyChannel(req.value)).toBe(true);
    expect(assertNoDirectBackendPaths(req.value.path)).toBe(true);
    expect(req.value.path).toBe("/v1/executions");
  });
});
