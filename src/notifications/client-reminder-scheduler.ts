import cron from "node-cron";
import mongoose from "mongoose";
import Brands from "../models/brand.model";
import { CreditBalanceModel } from "../models/credit-balance.model";
import Organizations from "../models/organization.model";
import { PlansModel } from "../models/plan.model";
import Projects from "../models/projects.model";
import Subscriptions from "../models/subscription.model";
import Tasks from "../models/tasks.model";
import Users from "../models/users.model";
import { dispatchClientNotification } from "./client-notification-service";
import { planDisplayName } from "./plan-display-name";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BATCH = 500;

const ago = (ms: number) => new Date(Date.now() - ms);
const progressAction = (projectId: unknown) => ({
  action: `/progress?projectId=${encodeURIComponent(String(projectId))}`,
});

async function onboardingAbandoned(): Promise<void> {
  const users = await Users.find({
    role: "customer",
    createdAt: { $lte: ago(DAY), $gte: ago(7 * DAY) },
  })
    .select("_id")
    .limit(BATCH)
    .lean();
  if (!users.length) return;
  const owners = new Set(
    (await Organizations.find({ owner: { $in: users.map((u) => u._id) } }).select("owner").lean()).map(
      (o) => String(o.owner)
    )
  );
  for (const u of users) {
    if (owners.has(String(u._id))) continue;
    await dispatchClientNotification({
      eventKey: "ONBOARDING_ABANDONED",
      userId: u._id,
      primaryAction: { action: "/setup-business" },
      dedupeKey: "onboarding-abandoned",
      channels: ["in_app", "push", "email"],
    });
  }
}

async function brandSetupAbandoned(): Promise<void> {
  const orgs = await Organizations.find({ createdAt: { $lte: ago(DAY), $gte: ago(7 * DAY) } })
    .select("_id owner")
    .limit(BATCH)
    .lean();
  if (!orgs.length) return;
  const withBrand = new Set(
    (await Brands.distinct("organizationId", { organizationId: { $in: orgs.map((o) => o._id) } })).map(String)
  );
  for (const org of orgs) {
    if (!org.owner || withBrand.has(String(org._id))) continue;
    await dispatchClientNotification({
      eventKey: "BRAND_SETUP_ABANDONED",
      userId: org.owner,
      primaryAction: { action: "/setup-brand" },
      secondaryAction: { action: "/home" },
      dedupeKey: `brand-setup:${org._id}`,
      channels: ["in_app", "push", "email"],
    });
  }
}

async function projectAbandoned(): Promise<void> {
  const projects = await Projects.find({
    status: "planning",
    updatedAt: { $lte: ago(2 * DAY), $gte: ago(14 * DAY) },
  })
    .select("_id userId title")
    .limit(BATCH)
    .lean();
  for (const p of projects) {
    await dispatchClientNotification({
      eventKey: "PROJECT_ABANDONED",
      userId: p.userId,
      variables: { "Project Name": p.title || "Your project" },
      primaryAction: progressAction(p._id),
      secondaryAction: { action: "/progress" },
      entityType: "project",
      entityId: p._id,
      dedupeKey: `project-abandoned:${p._id}`,
      channels: ["in_app", "push"],
    });
  }
}

/** Escalating reminders while a draft sits in client review. */
async function reviewPending(): Promise<void> {
  const tasks = await Tasks.find({
    status: "client_review",
    updatedAt: { $lte: ago(2 * DAY), $gte: ago(30 * DAY) },
  })
    .select("_id project updatedAt")
    .limit(BATCH)
    .lean();
  if (!tasks.length) return;
  const projects = new Map(
    (
      await Projects.find({ _id: { $in: tasks.map((t) => t.project) } })
        .select("_id userId title creationMode")
        .lean()
    ).map((p) => [String(p._id), p])
  );
  for (const task of tasks) {
    const project = projects.get(String(task.project));
    if (!project?.userId) continue;
    const reviewSince = new Date((task as { updatedAt?: Date }).updatedAt ?? Date.now()).getTime();
    const waited = Date.now() - reviewSince;
    const eventKey =
      waited >= 7 * DAY
        ? "REENGAGEMENT_APPROVAL_PENDING"
        : waited >= 5 * DAY
          ? "DRAFT_NOT_REVIEWED"
          : project.creationMode === "hybrid"
            ? "HYBRID_REVIEW_PENDING"
            : "FEEDBACK_PENDING";
    await dispatchClientNotification({
      eventKey,
      userId: project.userId,
      variables: { "Project Name": project.title || "Your project" },
      primaryAction: progressAction(project._id),
      entityType: "task",
      entityId: task._id,
      dedupeKey: `${task._id}:${reviewSince}:${eventKey}`,
      channels: ["in_app", "push"],
    });
  }
}

/** Subscription.planId holds either a Plans ObjectId or a Razorpay plan_id. */
async function plansByReference(refs: string[]): Promise<Map<string, unknown>> {
  const unique = [...new Set(refs.filter(Boolean))];
  const objectIds = unique.filter((r) => mongoose.isValidObjectId(r));
  const plans = unique.length
    ? await PlansModel.find({
        $or: [{ _id: { $in: objectIds } }, { plan_id: { $in: unique } }],
      }).lean()
    : [];
  const byRef = new Map<string, unknown>();
  for (const plan of plans) {
    byRef.set(String(plan._id), plan);
    if (plan.plan_id) byRef.set(plan.plan_id, plan);
  }
  return byRef;
}

async function checkoutNotCompleted(): Promise<void> {
  const pending = await Subscriptions.find({
    status: "created",
    createdAt: { $lte: ago(HOUR), $gte: ago(2 * DAY) },
  })
    .limit(BATCH)
    .lean();
  const plans = await plansByReference(pending.map((s) => String(s.planId ?? "")));
  for (const sub of pending) {
    const active = await Subscriptions.exists({
      userId: sub.userId,
      status: { $in: ["active", "authenticated"] },
    });
    if (active) continue;
    await dispatchClientNotification({
      eventKey: "PAYMENT_STARTED_NOT_COMPLETED",
      userId: sub.userId,
      variables: { "Plan Name": planDisplayName(plans.get(String(sub.planId))) },
      primaryAction: { action: "/subscription" },
      secondaryAction: { action: "/subscription-billing" },
      dedupeKey: `checkout:${sub._id}`,
      channels: ["in_app", "email"],
    });
  }
}

async function unusedCredits(): Promise<void> {
  const balances = await CreditBalanceModel.find({
    periodEnd: { $gt: new Date(), $lte: new Date(Date.now() + 7 * DAY) },
    allocated: { $gt: 0 },
    $expr: { $gte: ["$remaining", { $multiply: ["$allocated", 0.5] }] },
  })
    .limit(BATCH)
    .lean();
  for (const b of balances) {
    await dispatchClientNotification({
      eventKey: "UNUSED_CREDITS",
      userId: b.userId,
      variables: { Credits: b.remaining },
      primaryAction: { action: "/home" },
      secondaryAction: { action: "/subscription-billing" },
      dedupeKey: `unused:${b._id}`,
      channels: ["in_app", "push"],
    });
  }
}

export async function runClientReminders(): Promise<void> {
  for (const job of [
    onboardingAbandoned,
    brandSetupAbandoned,
    projectAbandoned,
    reviewPending,
    checkoutNotCompleted,
    unusedCredits,
  ]) {
    try {
      await job();
    } catch (err) {
      console.error(`[notifications] reminder ${job.name} failed`, err);
    }
  }
}

export function startClientReminderScheduler(): void {
  cron.schedule("15 * * * *", () => void runClientReminders());
}
