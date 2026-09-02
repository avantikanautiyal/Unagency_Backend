/** Shared constants and helpers for demo seed data and test-mode API bypasses. */

export const DEMO_EMAIL_DOMAIN = "@unagency.test";

export const DEMO_USERS = {
  demo: "demo@unagency.test",
  rm: "rm@unagency.test",
  cs2: "cs2@unagency.test",
  cs3: "cs3@unagency.test",
  cs4: "cs4@unagency.test",
  teammate: "teammate@unagency.test",
  invitee: "invitee@unagency.test",
  admin: "admin@unagency.test",
  superadmin: "superadmin@unagency.test",
  resource: "resource@unagency.test",
  resource2: "resource2@unagency.test",
  resource3: "resource3@unagency.test",
  resource4: "resource4@unagency.test",
} as const;

/** Extra CS portal logins (beyond primary RM). */
export const DEMO_CS_EXTRA_USERS = [
  DEMO_USERS.cs2,
  DEMO_USERS.cs3,
  DEMO_USERS.cs4,
] as const;

/** Extra Resource / designer portal logins (beyond primary designer). */
export const DEMO_RESOURCE_EXTRA_USERS = [
  DEMO_USERS.resource2,
  DEMO_USERS.resource3,
  DEMO_USERS.resource4,
] as const;

export const DEMO_PLAN_IDS = {
  trial: "plan_demo_trial",
  bronze: "plan_demo_bronze_monthly",
  silver: "plan_demo_silver_monthly",
  gold: "plan_demo_gold_monthly",
  platinum: "plan_demo_platinum_monthly",
} as const;

export const DEMO_SUBSCRIPTION_ID = "sub_demo_gold_demo_user";
export const DEMO_PAYMENT_IDS = ["pay_demo_001", "pay_demo_002", "pay_demo_003"] as const;

export const isDemoSeedEnabled = (): boolean =>
  process.env.RAZORPAY_MODE === "test" || process.env.DEMO_SEED_MODE === "true";

export const isDemoSubscriptionId = (id?: string | null): boolean =>
  !!id && id.startsWith("sub_demo_");

export const isDemoPaymentId = (id?: string | null): boolean =>
  !!id && id.startsWith("pay_demo_");

export const isDemoPlanId = (id?: string | null): boolean =>
  !!id && id.startsWith("plan_demo_");

export function buildDemoRazorpaySubscription(
  subscriptionId: string,
  planId: string,
  email: string = DEMO_USERS.demo
) {
  const now = Math.floor(Date.now() / 1000);
  const oneYearLater = now + 365 * 24 * 60 * 60;

  return {
    id: subscriptionId,
    plan_id: planId,
    status: "active",
    current_start: now,
    current_end: oneYearLater,
    customer_email: email,
    customer_contact: "9876543210",
    payment_method: "card",
    remaining_count: 11,
    total_count: 12,
  };
}

export function buildDemoRazorpayPayment(
  paymentId: string,
  amountPaise: number,
  email: string = DEMO_USERS.demo,
  subscriptionId: string = DEMO_SUBSCRIPTION_ID
) {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: paymentId,
    amount: amountPaise,
    tax: 0,
    status: "captured",
    created_at: now,
    email,
    contact: "9876543210",
    method: "card",
    order_id: subscriptionId,
    notes: {
      subscription_id: subscriptionId,
      user_id: email,
    },
    card: {
      network: "Visa",
      last4: "4242",
      name: "Demo User",
    },
  };
}

export function buildRazorpayPlanItem(
  planId: string,
  name: string,
  amountPaise: number,
  period: "monthly" | "yearly" = "monthly",
  interval = 1
) {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: planId,
    entity: "plan",
    interval,
    period,
    item: {
      id: `item_${planId}`,
      active: true,
      name,
      description: `${name} membership plan`,
      amount: amountPaise,
      unit_amount: amountPaise,
      currency: "INR",
      type: "plan",
      unit: null,
      tax_inclusive: false,
      hsn_code: null,
      sac_code: null,
      tax_rate: null,
      tax_id: null,
      tax_group_id: null,
      created_at: now,
      updated_at: now,
    },
    created_at: now,
  };
}
