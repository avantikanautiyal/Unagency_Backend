/**
 * Exclude demo seed fixtures from admin analytics (@unagency.test, Demo orgs, [Demo] titles).
 */

import Organizations from "../../../models/organization.model";
import Users from "../../../models/users.model";

export const DEMO_EMAIL_DOMAIN = "@unagency.test";

export function isDemoEmail(email?: string | null): boolean {
  return (email ?? "").toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);
}

export function isDemoOrgName(name?: string | null): boolean {
  const value = (name ?? "").trim().toLowerCase();
  return (
    value === "demo creative studio" ||
    value.startsWith("demo ") ||
    value.includes("demo creative")
  );
}

export function isDemoUserName(name?: string | null): boolean {
  return /^demo(\s|$)/i.test((name ?? "").trim());
}

export function isDemoTitle(title?: string | null): boolean {
  return /^\s*\[demo\]/i.test(title ?? "");
}

export type AdminDemoExclusions = {
  organizationIds: Set<string>;
  customerUserIds: Set<string>;
};

let cachedExclusions: AdminDemoExclusions | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function loadAdminDemoExclusions(): Promise<AdminDemoExclusions> {
  if (cachedExclusions && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedExclusions;
  }

  const organizationIds = new Set<string>();
  const customerUserIds = new Set<string>();

  const demoUsers = await Users.find({
    $or: [
      { email: { $regex: /@unagency\.test$/i } },
      { name: { $regex: /^demo(\s|$)/i } },
    ],
  })
    .select("_id")
    .lean();

  for (const user of demoUsers) {
    customerUserIds.add(String(user._id));
  }

  const orgs = await Organizations.find({}).select("_id companyName owner").lean();
  for (const org of orgs) {
    const orgId = String(org._id);
    const ownerId = String(org.owner ?? "");
    if (isDemoOrgName(org.companyName) || customerUserIds.has(ownerId)) {
      organizationIds.add(orgId);
      if (ownerId) customerUserIds.add(ownerId);
    }
  }

  cachedExclusions = { organizationIds, customerUserIds };
  cachedAt = Date.now();
  return cachedExclusions;
}

export function isDemoOrganizationId(
  organizationId: string | null | undefined,
  exclusions: AdminDemoExclusions
): boolean {
  const id = String(organizationId ?? "").trim();
  return id.length > 0 && exclusions.organizationIds.has(id);
}

export function isDemoCustomerUserId(
  userId: string | null | undefined,
  exclusions: AdminDemoExclusions
): boolean {
  const id = String(userId ?? "").trim();
  return id.length > 0 && exclusions.customerUserIds.has(id);
}

export function invalidateAdminDemoExclusionsCache(): void {
  cachedExclusions = null;
  cachedAt = 0;
}
