import mongoose from "mongoose";
import Projects from "../models/projects.model";
import type { ExecutionResource } from "../platform/api/contracts";
import { EnterpriseExecution } from "../platform/infrastructure/durability/mongo/models/enterprise-execution.model";
import { EnterpriseExecutionExtras } from "../platform/infrastructure/durability/mongo/models/enterprise-execution-extras.model";
import type { ClientNotificationEventKey } from "./client-notification-catalog";
import { dispatchClientNotification } from "./client-notification-service";

const CREATIVE_ACTIONS = ["generate", "route_visual", "route_visual_refine", "refine_brief"];
const REVISION_ACTIONS = new Set(["route_visual_refine", "refine_brief"]);
/** First creative step of a CDF flow: the directions the client chooses from. */
const ROUTE_PHASE = /(^|-)routes$|^territories$/;

type Snapshot = {
  cdfPhaseId?: string;
  cdfSessionId?: string;
  cdfRefineSource?: boolean;
  generationFanoutGroupId?: string;
};

type Kind = "routes" | "revision" | "creative";

async function snapshotOf(executionId: string): Promise<Snapshot> {
  const extras = await EnterpriseExecutionExtras.findOne({ executionId })
    .select({
      "createMetadataSnapshot.cdfPhaseId": 1,
      "createMetadataSnapshot.cdfSessionId": 1,
      "createMetadataSnapshot.cdfRefineSource": 1,
      "createMetadataSnapshot.generationFanoutGroupId": 1,
    })
    .lean<{ createMetadataSnapshot?: Snapshot }>();
  return extras?.createMetadataSnapshot ?? {};
}

function kindOf(productAction: string, snap: Snapshot): Kind {
  if (REVISION_ACTIONS.has(productAction) || snap.cdfRefineSource === true) return "revision";
  if (productAction === "route_visual") return "routes";
  if (snap.cdfPhaseId && ROUTE_PHASE.test(snap.cdfPhaseId)) return "routes";
  return "creative";
}

async function projectFor(
  userId: string,
  sessionId?: string
): Promise<{ _id: unknown; title?: string; creationMode?: string } | null> {
  if (!sessionId) return null;
  return Projects.findOne({ userId: new mongoose.Types.ObjectId(userId), sessionId })
    .select("_id title creationMode")
    .lean<{ _id: unknown; title?: string; creationMode?: string }>();
}

type GovernanceCheck = { checkId?: string; status?: string; message?: string };

/** brand_guard failed or passed with warnings → the client should look before approving. */
async function brandGuardConcern(executionId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const extras = await EnterpriseExecutionExtras.findOne({ executionId })
      .select({ "governance.checks": 1 })
      .lean<{ governance?: { checks?: GovernanceCheck[] } }>();
    const checks = extras?.governance?.checks;
    if (checks?.length) {
      const guard = checks.find((c) => c.checkId === "brand_guard");
      if (!guard) return false;
      return guard.status === "FAIL" || /^PASS_WITH_WARNINGS/i.test(guard.message ?? "");
    }
    // Governance is sometimes written just after the success save.
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

/**
 * AI / Hybrid output notifications. One step fans out to several engines in
 * parallel, so everything is keyed on the fan-out group: the client hears
 * once per step, not once per engine. Planning, chat and other internal
 * executions are ignored. Never throws.
 */
export async function notifyClientExecutionFinished(
  previous: Partial<ExecutionResource> | null,
  next: ExecutionResource
): Promise<void> {
  try {
    const userId = next.userId ?? previous?.userId;
    const productAction = next.productAction ?? previous?.productAction;
    if (!userId || !productAction || !mongoose.isValidObjectId(userId)) return;
    if (!CREATIVE_ACTIONS.includes(productAction)) return;

    const succeeded = next.status === "succeeded" && !!next.artifactIds?.length;
    const failed = next.status === "failed";
    if (!succeeded && !failed) return;

    const snap = await snapshotOf(next.executionId);
    const kind = kindOf(productAction, snap);
    const groupId =
      snap.generationFanoutGroupId ??
      next.parentExecutionId ??
      previous?.parentExecutionId ??
      next.executionId;
    const conversationId = next.conversationId ?? previous?.conversationId;
    const project = await projectFor(userId, snap.cdfSessionId);
    const hybrid = project?.creationMode === "hybrid";
    const projectId = project ? String(project._id) : undefined;
    const projectName = project?.title || "Your project";
    const primaryAction = projectId
      ? { action: `/progress?projectId=${encodeURIComponent(projectId)}` }
      : { action: `/executions/${encodeURIComponent(next.executionId)}` };
    const base = {
      userId,
      primaryAction,
      entityType: projectId ? "project" : "execution",
      entityId: projectId ?? groupId,
      metadata: { executionId: next.executionId, conversationId, groupId, phaseId: snap.cdfPhaseId },
      channels: ["in_app", "push"] as const,
    };

    if (failed) {
      // Engine fallback may still deliver this step — only tell the client
      // when every attempt in the group has ended and none produced output.
      if (snap.generationFanoutGroupId) {
        const siblings = await EnterpriseExecution.find({
          userId,
          executionId: { $ne: next.executionId },
          ...(conversationId ? { conversationId } : {}),
          createdAt: { $gte: new Date(Date.now() - 6 * 3_600_000) },
        })
          .select("executionId status artifactIds")
          .lean<Array<{ executionId: string; status?: string; artifactIds?: string[] }>>();
        if (siblings.length) {
          const ids = siblings.map((s) => s.executionId);
          const inGroup = new Set(
            (
              await EnterpriseExecutionExtras.find({
                executionId: { $in: ids },
                "createMetadataSnapshot.generationFanoutGroupId": snap.generationFanoutGroupId,
              })
                .select("executionId")
                .lean<Array<{ executionId: string }>>()
            ).map((e) => e.executionId)
          );
          const group = siblings.filter((s) => inGroup.has(s.executionId));
          const pending = group.some((s) =>
            ["queued", "running", "pending", "in_progress"].includes(String(s.status))
          );
          const delivered = group.some(
            (s) => s.status === "succeeded" && (s.artifactIds?.length ?? 0) > 0
          );
          if (pending || delivered) return;
        }
      }
      await dispatchClientNotification({
        ...base,
        eventKey: "AI_GENERATION_FAILED",
        dedupeKey: `failed:${groupId}`,
      });
      return;
    }

    if (await brandGuardConcern(next.executionId)) {
      await dispatchClientNotification({
        ...base,
        eventKey: "BRANDGUARD_WARNING",
        dedupeKey: `brandguard:${groupId}`,
      });
    }

    if (kind === "routes") {
      const eventKey: ClientNotificationEventKey = hybrid ? "HYBRID_AI_ROUTES_READY" : "AI_ROUTES_READY";
      await dispatchClientNotification({
        ...base,
        eventKey,
        variables: { "Project Name": projectName },
        dedupeKey: `routes:${groupId}`,
      });
      return;
    }

    if (kind === "revision") {
      await dispatchClientNotification({
        ...base,
        eventKey: "AI_REVISION_READY",
        variables: { "Project Name": projectName },
        secondaryAction: primaryAction,
        dedupeKey: `revision:${groupId}`,
      });
      return;
    }

    // Draft number = how many distinct steps have delivered in this chat.
    let draftNumber = 1;
    if (conversationId) {
      const done = await EnterpriseExecution.find({
        userId,
        conversationId,
        productAction: { $in: CREATIVE_ACTIONS },
        status: "succeeded",
      })
        .select("executionId")
        .lean<Array<{ executionId: string }>>();
      const groups = await EnterpriseExecutionExtras.distinct(
        "createMetadataSnapshot.generationFanoutGroupId",
        { executionId: { $in: done.map((d) => d.executionId) } }
      );
      draftNumber = Math.max(groups.filter(Boolean).length, 1);
    }
    await dispatchClientNotification({
      ...base,
      eventKey: "AI_CREATIVE_READY",
      variables: { "#": draftNumber, "Project Name": projectName },
      secondaryAction: primaryAction,
      dedupeKey: `creative:${groupId}`,
    });
  } catch (err) {
    console.error("[notifications] execution notification failed", err);
  }
}

