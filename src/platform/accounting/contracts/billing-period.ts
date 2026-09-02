/**
 * UTC calendar-month billing period helpers for internal reporting.
 */

export interface BillingPeriodBounds {
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly billingPeriod: string;
}

/** Format: YYYY-MM */
export function formatBillingPeriod(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function billingPeriodBoundsForDate(date: Date): BillingPeriodBounds {
  const periodStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const periodEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return {
    periodStart,
    periodEnd,
    billingPeriod: formatBillingPeriod(date),
  };
}

export function billingPeriodBoundsForKey(billingPeriod: string): BillingPeriodBounds {
  const [year, month] = billingPeriod.split("-").map(Number);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd, billingPeriod };
}

export type AdminPeriodFilter =
  | "current_month"
  | "previous_month"
  | "last_3_months"
  | "last_6_months"
  | "current_year"
  | "custom";

export interface ResolvedPeriodRange {
  readonly start: Date;
  readonly end: Date;
  readonly label: string;
}

export function resolveAdminPeriodRange(
  filter: AdminPeriodFilter,
  now: Date = new Date(),
  custom?: { readonly start: Date; readonly end: Date }
): ResolvedPeriodRange {
  if (filter === "custom" && custom) {
    return {
      start: custom.start,
      end: custom.end,
      label: "custom",
    };
  }

  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (filter) {
    case "previous_month": {
      const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
      return { start, end, label: "previous_month" };
    }
    case "last_3_months": {
      const start = new Date(Date.UTC(y, m - 2, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
      return { start, end, label: "last_3_months" };
    }
    case "last_6_months": {
      const start = new Date(Date.UTC(y, m - 5, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
      return { start, end, label: "last_6_months" };
    }
    case "current_year": {
      const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
      return { start, end, label: "current_year" };
    }
    case "current_month":
    default: {
      const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
      return { start, end, label: "current_month" };
    }
  }
}
