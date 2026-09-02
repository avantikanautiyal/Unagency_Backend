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

export type AdminDashboardPayload = {
  organizations: AdminOrganizationRow[];
  billing: AdminBillingSummary;
  analytics: AdminAnalyticsSummary;
};

export async function buildAdminDashboard(input: {
  roles: readonly string[];
  period?: string;
  openEscalations: number;
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
  });

  const billing = await buildAdminBillingSummary(filter);
  const [analytics, organizations] = await Promise.all([
    buildAdminAnalyticsSummary(filter, input.openEscalations),
    buildAdminOrganizationsList({
      roles: input.roles,
      billingByOrganization: billing.byOrganization,
    }),
  ]);

  return writeAdminCache(cacheKey, { organizations, billing, analytics });
}
