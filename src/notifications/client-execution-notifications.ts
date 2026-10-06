import mongoose from "mongoose";
import type { ExecutionResource } from "../platform/api/contracts";
import { EnterpriseExecution } from "../platform/infrastructure/durability/mongo/models/enterprise-execution.model";
import { dispatchClientNotification } from "./client-notification-service";

const CREATIVE_ACTIONS = ["generate", "route_visual_refine", "refine_brief"];
const REVISION_ACTIONS = new Set(["route_visual_refine", "refine_brief"]);

/**
 * Sends AI Mode notifications when a client-facing generation first succeeds
 * with output. Planning, chat and other internal executions are ignored.
 */
export async function notifyClientExecutionSucceeded(
  previous: Partial<ExecutionResource> | null,
  next: ExecutionResource
): Promise<void> {
  if (!next.artifactIds?.length) return;
  const userId = next.userId ?? previous?.userId;
  const productAction = next.productAction ?? previous?.productAction;
  if (!userId || !productAction || !mongoose.isValidObjectId(userId)) return;

  const action = { action: `/executions/${encodeURIComponent(next.executionId)}` };
  const conversationId = next.conversationId ?? previous?.conversationId;

  if (productAction === "route_visual") {
    const batchId =
      next.parentExecutionId ?? previous?.parentExecutionId ?? next.executionId;
    await dispatchClientNotification({
      eventKey: "AI_ROUTES_READY",
      userId,
      primaryAction: action,
      entityType: "execution",
      entityId: batchId,
      metadata: { executionId: next.executionId, conversationId },
      dedupeKey: `routes:${batchId}`,
      channels: ["in_app", "push"],
    });
    return;
  }

  if (REVISION_ACTIONS.has(productAction)) {
    await dispatchClientNotification({
      eventKey: "AI_REVISION_READY",
      userId,
      primaryAction: action,
      secondaryAction: action,
      entityType: "execution",
      entityId: next.executionId,
      metadata: { conversationId },
      dedupeKey: next.executionId,
      channels: ["in_app", "push"],
    });
    return;
  }

  if (productAction !== "generate") return;

  const draftNumber = conversationId
    ? await EnterpriseExecution.countDocuments({
        userId,
        conversationId,
        productAction: { $in: CREATIVE_ACTIONS },
        status: "succeeded",
      })
    : 1;
  await dispatchClientNotification({
    eventKey: "AI_CREATIVE_READY",
    userId,
    variables: { "#": Math.max(draftNumber, 1) },
    primaryAction: action,
    secondaryAction: action,
    entityType: "execution",
    entityId: next.executionId,
    metadata: { conversationId },
    dedupeKey: next.executionId,
    channels: ["in_app", "push"],
  });
}
