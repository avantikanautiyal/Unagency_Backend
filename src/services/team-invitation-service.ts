/**
 * Team invitations by email.
 *
 * An owner can invite any email, with or without an UNAGENCY account. The
 * invitation is stored on the `teams` row as `invitedEmail` (and `userId` when
 * the account already exists). When the invitee signs in (Google or any other
 * Firebase method) with that email, every pending invitation for it is accepted
 * automatically, so they land straight in the inviting organisation.
 */

import mongoose from "mongoose";
import Teams from "../models/team.model";
import Users from "../models/users.model";
import Organizations from "../models/organization.model";
import Subscriptions from "../models/subscription.model";
import { PlansModel } from "../models/plan.model";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInviteEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive exact match: some legacy Users rows keep mixed-case emails. */
export function findUserByEmailInsensitive(email: string) {
  return Users.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });
}

/**
 * Additional-member seats on the owner's plan, or null when the owner has no
 * resolvable plan (no limit is enforced then).
 */
export async function resolveAdditionalMemberSeats(
  ownerUserId: string
): Promise<number | null> {
  const owner = await Users.findById(ownerUserId).select("subscription").lean();
  const subscriptionId = (owner as any)?.subscription?.id;
  if (!subscriptionId) return null;
  const subscription = await Subscriptions.findOne({ subscriptionId }).lean();
  if (!subscription) return null;
  const plan = await PlansModel.findOne({ plan_id: (subscription as any).planId }).lean();
  if (!plan) return null;
  const seats = Number((plan as any).max_additional_members);
  return Number.isFinite(seats) ? seats : null;
}

/** Pending + accepted non-owner rows: a pending invite holds a seat. */
export function countUsedMemberSeats(organizationId: mongoose.Types.ObjectId) {
  return Teams.countDocuments({
    Organization: organizationId,
    role: "member",
    invitationStatus: { $in: ["pending", "accepted"] },
  });
}

/**
 * Accept every pending invitation addressed to this user (by email or by an
 * existing userId). Returns the organisation ids joined. Never throws: a
 * failure here must not block sign-in.
 */
export async function claimPendingInvitations(user: {
  _id: mongoose.Types.ObjectId;
  email?: string;
  name?: string;
}): Promise<string[]> {
  // No live connection (tests, start-up): don't sit in mongoose's 10 s buffer.
  if (mongoose.connection.readyState !== 1) return [];
  try {
    const email = normalizeInviteEmail(user.email);
    const or: Record<string, unknown>[] = [{ userId: user._id }];
    if (email) or.push({ invitedEmail: email });
    const pending = await Teams.find({
      invitationStatus: "pending",
      role: "member",
      $or: or,
    });
    if (pending.length === 0) return [];

    const joined: string[] = [];
    for (const row of pending) {
      const duplicate = await Teams.exists({
        _id: { $ne: row._id },
        Organization: row.Organization,
        userId: user._id,
        invitationStatus: "accepted",
      });
      if (duplicate) {
        await Teams.deleteOne({ _id: row._id });
        continue;
      }
      // Conditional update: two concurrent sign-ins accept the row only once.
      const accepted = await Teams.findOneAndUpdate(
        { _id: row._id, invitationStatus: "pending" },
        {
          $set: {
            userId: user._id,
            invitationStatus: "accepted",
            ...(email ? { invitedEmail: email } : {}),
          },
        },
        { new: true }
      );
      if (!accepted) continue;
      joined.push(accepted.Organization.toString());
      void notifyOwnerInviteAccepted(accepted._id.toString(), accepted.Organization, user);
    }
    return joined;
  } catch (err) {
    console.error("[team-invitations] claim failed", err);
    return [];
  }
}

async function notifyOwnerInviteAccepted(
  teamId: string,
  organizationId: mongoose.Types.ObjectId,
  member: { name?: string; email?: string }
) {
  try {
    const organization = await Organizations.findById(organizationId);
    if (!organization?.owner) return;
    // Lazy: the notification stack opens queue connections on import, and this
    // module is loaded by the sign-in resolver.
    const { dispatchClientNotification } = await import(
      "../notifications/client-notification-service"
    );
    await dispatchClientNotification({
      eventKey: "INVITE_ACCEPTED",
      userId: organization.owner as any,
      variables: {
        Name: member.name || member.email || "Team member",
        Organisation: (organization as any).companyName || "your workspace",
      },
      primaryAction: { action: "/manage-team", text: "View Team" },
      entityType: "organisation",
      entityId: organization._id,
      dedupeKey: `${teamId}:accepted`,
      channels: ["in_app", "email"],
      symbol: "👋",
    } as any);
  } catch (err) {
    console.error("[team-invitations] owner notification failed", err);
  }
}
