/**
 * Activity timeline + task contracts.
 */

import type { StudioActivityKind } from "./enums";

export interface StudioActivity {
  readonly activityId: string;
  readonly workspaceId: string;
  readonly kind: StudioActivityKind;
  readonly actorId: string;
  readonly actorKind: "user" | "ai" | "system";
  readonly summary: string;
  readonly targetKind?: string;
  readonly targetId?: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StudioTimeline {
  readonly timelineId: string;
  readonly workspaceId: string;
  readonly activityIds: readonly string[];
  readonly updatedAt: string;
}

export interface StudioTask {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly assigneeId?: string;
  readonly status: "todo" | "in_progress" | "blocked" | "done";
  readonly dueAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
