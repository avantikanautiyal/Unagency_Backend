import mongoose from "mongoose";
import Projects from "../models/projects.model";
import {
  dispatchClientNotification,
  type DispatchClientNotificationInput,
} from "./client-notification-service";

type ClientNotificationAction = NonNullable<DispatchClientNotificationInput["primaryAction"]>;

export type CdfTransitionNotificationInput = {
  userId?: string;
  ok: boolean;
  errorMessage?: string;
  action?: string;
  finalAction?: string;
  finalActionId?: string;
  refineScope?: string;
  artifactId?: string;
  artifactVersion?: number;
  executionId?: string;
  projectId?: string;
  sessionId?: string;
  requestId?: string;
};

async function projectName(projectId?: string): Promise<string> {
  if (!projectId || !mongoose.isValidObjectId(projectId)) return "Your creative";
  const project = await Projects.findById(projectId).select("title").lean<{ title?: string }>();
  return project?.title || "Your creative";
}

/**
 * Client notifications for AI Mode decisions taken through CDF transitions
 * (approve, feedback, download, Studio handoff). Never throws.
 */
export async function notifyCdfTransition(input: CdfTransitionNotificationInput): Promise<void> {
  try {
    const { userId, action } = input;
    if (!userId || !mongoose.isValidObjectId(userId) || !action) return;

    const primaryAction: ClientNotificationAction | undefined = input.projectId
      ? { action: `/progress?projectId=${encodeURIComponent(input.projectId)}` }
      : input.executionId
        ? { action: `/executions/${encodeURIComponent(input.executionId)}` }
        : undefined;
    const base = {
      userId,
      primaryAction,
      entityType: input.projectId ? "project" : "cdf_session",
      entityId: input.projectId ?? input.sessionId,
      metadata: { sessionId: input.sessionId, executionId: input.executionId },
    };
    const eventId = input.requestId ?? `${input.sessionId ?? "cdf"}:${Date.now()}`;

    if (!input.ok) {
      if (action === "handoff_studio" && /member|entitle|subscri|plan/i.test(input.errorMessage ?? "")) {
        await dispatchClientNotification({
          ...base,
          eventKey: "STUDIO_ACCESS_REQUIRED",
          primaryAction: { action: "/subscription" },
          dedupeKey: `studio-access:${input.sessionId ?? eventId}`,
        });
      }
      return;
    }

    if (action === "approve") {
      const approvalKey = `${input.artifactId ?? input.sessionId}@${input.artifactVersion ?? ""}`;
      await dispatchClientNotification({
        ...base,
        eventKey: "AI_CREATIVE_APPROVED",
        variables: { "Project Name": await projectName(input.projectId) },
        dedupeKey: `approve:${approvalKey}`,
        channels: ["in_app", "push"],
      });
      await dispatchClientNotification({
        ...base,
        eventKey: "FIRST_CREATIVE_COMPLETED",
        primaryAction: { action: "/home" },
        secondaryAction: primaryAction,
        dedupeKey: "first-creative",
      });
      return;
    }

    if (action === "refine") {
      await dispatchClientNotification({
        ...base,
        eventKey: /brief/i.test(input.refineScope ?? "") ? "REFINED_BRIEF_SUBMITTED" : "AI_FEEDBACK_SUBMITTED",
        dedupeKey: `refine:${eventId}`,
      });
      return;
    }

    if (action === "handoff_studio") {
      await dispatchClientNotification({
        ...base,
        eventKey: "TASK_SENT_TO_STUDIO",
        dedupeKey: `studio:${input.sessionId ?? eventId}`,
        channels: ["in_app", "push"],
      });
      return;
    }

    const finalLabel = `${input.finalActionId ?? ""} ${input.finalAction ?? ""}`;
    if (action === "final_action" && /download|export/i.test(finalLabel) && !/\bhd\b|high/i.test(finalLabel)) {
      await dispatchClientNotification({
        ...base,
        eventKey: "FREE_DOWNLOAD_READY",
        dedupeKey: `download:${eventId}`,
      });
    }
  } catch (err) {
    console.error("[notifications] CDF transition notification failed", err);
  }
}
