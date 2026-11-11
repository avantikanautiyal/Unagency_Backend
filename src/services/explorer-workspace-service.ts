/**
 * "Just Exploring" personal workspace.
 *
 * Explorers never set up a business or brand. Every generation still needs an
 * organisation (tenant isolation) and vault / studio chat / projects are keyed
 * on a brand, so an explorer gets:
 *   - a personal organisation (accountType "exploring", no business details)
 *   - one hidden generic brand (isGeneric) that is never shown in brand
 *     pickers, never counts toward plan limits and never feeds brand identity
 *     into prompts — output stays generic.
 */

import mongoose from "mongoose";
import Organizations from "../models/organization.model";
import Brands from "../models/brand.model";
import Teams from "../models/team.model";
import Users from "../models/users.model";

export const EXPLORER_ACCOUNT_TYPE = "exploring";
export const GENERIC_BRAND_NAME = "My Workspace";

/** Business-only fields — when present on an upgrade they replace explorer defaults. */
export const BUSINESS_UPGRADE_FIELDS = [
  "companyName",
  "companyType",
  "industry",
  "contactPerson",
  "contactMobile",
  "contactEmail",
  "companyHeadquaters",
  "companyAddress",
  "GST",
  "website",
  "targetAudience",
  "about",
  "businessAge",
  "businessSize",
  "accountType",
] as const;

export function isExplorerAccountType(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === EXPLORER_ACCOUNT_TYPE;
}

/** Hidden generic brand for an organisation — created once, reused afterwards. */
export async function ensureGenericBrand(input: {
  organizationId: string;
  userId: string;
}): Promise<string> {
  const orgOid = new mongoose.Types.ObjectId(input.organizationId);
  const existing = await Brands.findOne({ organizationId: orgOid, isGeneric: true })
    .select("_id status")
    .lean();
  if (existing?._id) {
    if (existing.status === "archived") {
      await Brands.updateOne(
        { _id: existing._id },
        { $set: { status: "active" }, $unset: { archivedAt: 1 } }
      );
    }
    return String(existing._id);
  }

  // Upsert keeps this race-safe (onboarding screen + auth gate may both ask).
  const userOid = new mongoose.Types.ObjectId(input.userId);
  const doc = await Brands.findOneAndUpdate(
    { organizationId: orgOid, isGeneric: true },
    {
      $setOnInsert: {
        organizationId: orgOid,
        ownerUserId: userOid,
        name: GENERIC_BRAND_NAME,
        status: "active",
        isGeneric: true,
        colors: [],
        memberUserIds: [userOid],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const brandId = String(doc!._id);

  // Studio (Human / Hybrid) chat is brand-scoped — provision like a normal brand.
  void import("./collaboration/collaboration-channel-service")
    .then(({ collaborationChannelService }) => {
      if (!collaborationChannelService.isConfigured()) return;
      return collaborationChannelService.provisionForBrand({
        brandId,
        name: GENERIC_BRAND_NAME,
        organizationId: input.organizationId,
        memberUserIds: [input.userId],
        createdByUserId: input.userId,
      });
    })
    .catch((err) => {
      console.warn(
        "[explorer-workspace] collaboration channel provision failed (non-fatal):",
        err instanceof Error ? err.message : err
      );
    });

  return brandId;
}

/**
 * Create (or return) the explorer's personal organisation + generic brand.
 * Idempotent: an explorer re-running onboarding gets the same workspace back.
 * A user who already owns a business organisation keeps it untouched.
 */
export async function ensureExplorerWorkspace(userId: string): Promise<{
  organization: InstanceType<typeof Organizations>;
  genericBrandId: string;
  created: boolean;
}> {
  const userOid = new mongoose.Types.ObjectId(userId);
  const owned = await Organizations.findOne({ owner: userOid });
  if (owned) {
    const genericBrandId = await ensureGenericBrand({
      organizationId: owned._id.toString(),
      userId,
    });
    return { organization: owned, genericBrandId, created: false };
  }

  const user = await Users.findById(userOid).lean();
  const displayName = String(user?.name ?? "").trim();
  const email = String(user?.email ?? "").trim();
  const contact =
    typeof user?.contact === "string"
      ? user.contact
      : user?.contact != null
        ? String(user.contact)
        : "";

  // Atomic upsert on owner — concurrent calls can never create two workspaces.
  const upserted = await Organizations.findOneAndUpdate(
    { owner: userOid },
    {
      $setOnInsert: {
        owner: userOid,
        companyName: displayName ? `${displayName}'s Workspace` : "Personal Workspace",
        companyType: "Personal",
        industry: "General",
        contactPerson: displayName || email.split("@")[0] || "",
        contactEmail: email,
        contactMobile: contact,
        status: "active",
        accountType: EXPLORER_ACCOUNT_TYPE,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
  );
  const organization = upserted.value!;
  const created = upserted.lastErrorObject?.updatedExisting === false;

  if (created) {
    await Teams.updateOne(
      { Organization: organization._id, userId: userOid },
      {
        $setOnInsert: {
          Organization: organization._id,
          role: "owner",
          invitationStatus: "accepted",
          userId: userOid,
        },
      },
      { upsert: true }
    );
  }

  const genericBrandId = await ensureGenericBrand({
    organizationId: organization._id.toString(),
    userId,
  });
  return { organization, genericBrandId, created };
}

/** Generic brand id for an organisation, if one exists (no create). */
export async function findGenericBrandId(organizationId: string): Promise<string | undefined> {
  if (!mongoose.isValidObjectId(organizationId)) return undefined;
  const doc = await Brands.findOne({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    isGeneric: true,
    status: { $ne: "archived" },
  })
    .select("_id")
    .lean();
  return doc?._id ? String(doc._id) : undefined;
}

const genericCache = new Map<string, { value: boolean; at: number }>();
const GENERIC_CACHE_MS = 5 * 60 * 1000;

/**
 * True when brandId is a hidden generic (explorer) brand. Cached — the flag
 * never changes after creation. Used to keep generation brand-neutral.
 */
export async function isGenericBrandId(brandId: string | undefined | null): Promise<boolean> {
  const id = String(brandId ?? "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return false;
  const hit = genericCache.get(id);
  if (hit && Date.now() - hit.at < GENERIC_CACHE_MS) return hit.value;
  // No live DB (tests / boot) — never block on mongoose query buffering.
  if (mongoose.connection?.readyState !== 1) return false;
  try {
    const doc = await Brands.findById(id).select("isGeneric").lean();
    const value = doc?.isGeneric === true;
    genericCache.set(id, { value, at: Date.now() });
    return value;
  } catch {
    return false;
  }
}
