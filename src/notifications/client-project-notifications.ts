import mongoose from "mongoose";
import Projects from "../models/projects.model";
import type {
  ClientNotificationChannel,
  ClientNotificationEventKey,
} from "./client-notification-catalog";
import { dispatchClientNotification } from "./client-notification-service";

type ModeEvents = {
  human: ClientNotificationEventKey | null;
  hybrid: ClientNotificationEventKey | null;
};

/**
 * Notifies a project's client using the Human or Hybrid copy for that project.
 * Never throws, so callers can await it inside request handlers.
 */
export async function notifyProjectOwner(input: {
  projectId: unknown;
  events: ModeEvents;
  dedupeKey: string;
  variables?: Readonly<Record<string, string | number | null | undefined>>;
  withSecondaryAction?: boolean;
  channels?: readonly ClientNotificationChannel[];
}): Promise<void> {
  try {
    const raw = input.projectId as { _id?: unknown } | string | null | undefined;
    const projectId = String(
      raw && typeof raw === "object" && "_id" in raw ? raw._id : raw ?? ""
    );
    if (!mongoose.isValidObjectId(projectId)) return;
    const project = await Projects.findById(projectId)
      .select("userId title creationMode")
      .lean();
    if (!project?.userId) return;
    const eventKey =
      project.creationMode === "hybrid" ? input.events.hybrid : input.events.human;
    if (!eventKey) return;
    const action = { action: `/progress?projectId=${projectId}` };
    await dispatchClientNotification({
      eventKey,
      userId: project.userId as unknown as mongoose.Types.ObjectId,
      variables: { "Project Name": project.title, ...input.variables },
      primaryAction: action,
      ...(input.withSecondaryAction ? { secondaryAction: action } : {}),
      entityType: "project",
      entityId: projectId,
      dedupeKey: input.dedupeKey,
      ...(input.channels ? { channels: input.channels } : {}),
    });
  } catch (error) {
    console.error("[notifyProjectOwner] failed", error);
  }
}
