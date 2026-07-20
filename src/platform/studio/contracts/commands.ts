/**
 * Studio command contracts — framework-agnostic mutations.
 * Gateway envelopes only — never OS / providers / runtime.
 */

import type {
  StudioActivityKind,
  StudioApprovalStatus,
  StudioDocumentKind,
  StudioPresenceStatus,
  StudioTypeId,
  StudioWidgetKind,
} from "./enums";
import type { StudioAiSession, StudioAiSessionRefs } from "./session";

export type StudioCommand =
  | {
      readonly kind: "create_workspace";
      readonly organizationId: string;
      readonly name: string;
      readonly studioType: StudioTypeId;
      readonly description?: string;
    }
  | {
      readonly kind: "open_studio";
      readonly workspaceId: string;
      readonly studioType: StudioTypeId;
    }
  | {
      readonly kind: "open_tab";
      readonly workspaceId: string;
      readonly title: string;
      readonly viewId?: string;
    }
  | {
      readonly kind: "set_active_tab";
      readonly workspaceId: string;
      readonly tabId: string;
    }
  | {
      readonly kind: "upsert_canvas";
      readonly workspaceId: string;
      readonly canvasId?: string;
      readonly name: string;
    }
  | {
      readonly kind: "set_panel_visibility";
      readonly panelId: string;
      readonly visible: boolean;
    }
  | {
      readonly kind: "start_ai_session";
      readonly organizationId: string;
      readonly title: string;
      readonly refs: StudioAiSessionRefs;
    }
  | {
      readonly kind: "update_ai_session";
      readonly sessionId: string;
      readonly status: StudioAiSession["status"];
      readonly executionId?: string;
    }
  | {
      readonly kind: "record_activity";
      readonly workspaceId: string;
      readonly activityKind: StudioActivityKind;
      readonly actorId: string;
      readonly actorKind: "user" | "ai" | "system";
      readonly summary: string;
      readonly targetKind?: string;
      readonly targetId?: string;
      readonly metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "add_comment";
      readonly workspaceId: string;
      readonly authorId: string;
      readonly body: string;
      readonly targetKind: string;
      readonly targetId: string;
      readonly mentionUserIds?: readonly string[];
    }
  | {
      readonly kind: "upsert_presence";
      readonly workspaceId: string;
      readonly userId: string;
      readonly status: StudioPresenceStatus;
      readonly viewId?: string;
    }
  | {
      readonly kind: "request_approval";
      readonly workspaceId: string;
      readonly title: string;
      readonly requesterId: string;
      readonly reviewerIds: readonly string[];
      readonly targetKind: string;
      readonly targetId: string;
    }
  | {
      readonly kind: "resolve_approval";
      readonly approvalId: string;
      readonly status: Extract<
        StudioApprovalStatus,
        "approved" | "rejected" | "changes_requested"
      >;
    }
  | {
      readonly kind: "create_document";
      readonly workspaceId: string;
      readonly kindDoc: StudioDocumentKind;
      readonly title: string;
      readonly bodyRef: string;
    }
  | {
      readonly kind: "register_widget";
      readonly widget: {
        readonly widgetId?: string;
        readonly kind: StudioWidgetKind;
        readonly title: string;
        readonly dataBinding?: Readonly<Record<string, unknown>>;
        readonly extensionId?: string;
      };
    }
  | {
      readonly kind: "register_extension";
      readonly extension: {
        readonly extensionId: string;
        readonly name: string;
        readonly version: string;
        readonly contributesWidgets?: readonly StudioWidgetKind[];
        readonly contributesPanels?: readonly string[];
        readonly contributesShortcuts?: readonly string[];
      };
    }
  | {
      readonly kind: "pin_item";
      readonly workspaceId: string;
      readonly targetKind: "workspace" | "project" | "campaign" | "document" | "asset" | "view";
      readonly targetId: string;
      readonly label: string;
    }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" }
  | { readonly kind: "create_snapshot"; readonly label: string }
  | { readonly kind: "restore_snapshot"; readonly snapshotId: string };

/** Gateway-bound request envelope — Studio never calls OS/providers/runtime. */
export interface StudioGatewayRequest {
  readonly channel: "enterprise_api_gateway";
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly organizationId: string;
  readonly accessTokenRef: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
