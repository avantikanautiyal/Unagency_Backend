/**
 * Single admin dashboard payload — one round-trip for overview screens.
 */

import {
  buildAdminAnalyticsSummary,
  buildAdminBillingSummary,
  resolveAdminMetricsFilter,
  type AdminAnalyticsSummary,
  type AdminBillingSummary,
} from "./admin-billing-analytics-service";
import {
  buildAdminOrganizationsList,
  type AdminOrganizationRow,
} from "./admin-organizations-service";
import {
  adminCacheKey,
  readAdminCache,
  writeAdminCache,
} from "./admin-metrics-cache";
import { EnterpriseOsHumanReview } from "../../infrastructure/durability/repositories/mongo-os-ledgers";

export type AdminDashboardPayload = {
  organizations: AdminOrganizationRow[];
  billing: AdminBillingSummary;
  analytics: AdminAnalyticsSummary;
};

async function countOpenEscalations(input: {
  crossTenant: boolean;
  organizationId?: string;
}): Promise<number> {
  const filter: Record<string, unknown> = { status: "PENDING" };
  if (!input.crossTenant) {
    if (!input.organizationId) return 0;
    filter.organizationId = input.organizationId;
  }
  try {
    return await EnterpriseOsHumanReview.countDocuments(filter);
  } catch {
    return 0;
  }
}

export async function buildAdminDashboard(input: {
  roles: readonly string[];
  period?: string;
  openEscalations?: number;
  tenantOrganizationId?: string;
}): Promise<AdminDashboardPayload> {
  const cacheKey = adminCacheKey({
    scope: "dashboard",
    roles: [...input.roles].sort(),
    period: input.period ?? "mtd",
  });
  const cached = readAdminCache<AdminDashboardPayload>(cacheKey);
  if (cached) return cached;

  const filter = resolveAdminMetricsFilter({
    roles: input.roles,
    period: input.period,
    tenantOrganizationId: input.tenantOrganizationId,
  });

  // Count pending reviews cheaply (avoid loading up to 500 review documents).
  const openEscalations =
    typeof input.openEscalations === "number"
      ? input.openEscalations
      : await countOpenEscalations({
          crossTenant: filter.crossTenant,
          organizationId: filter.organizationId,
        });

  // Billing first warms shared execution/task caches that analytics reuses.
  const billing = await buildAdminBillingSummary(filter);
  const [analytics, organizations] = await Promise.all([
    buildAdminAnalyticsSummary(filter, openEscalations),
    buildAdminOrganizationsList({
      roles: input.roles,
      billingByOrganization: billing.byOrganization,
    }),
  ]);

  return writeAdminCache(cacheKey, { organizations, billing, analytics });
}
