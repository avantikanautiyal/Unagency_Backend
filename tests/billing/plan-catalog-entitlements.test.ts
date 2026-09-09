/**
 * Exact entitlement matrix tests — source document absolute SoT.
 */

import {
  PLAN_CATALOG,
  getCanonicalPlan,
  listCanonicalPlans,
} from "../../src/billing/plan-catalog";
import { PLAN_CODES, isPlanCode } from "../../src/billing/plan-codes";
import {
  resolveActivePlanFromCode,
  resolveRazorpayPlanId,
} from "../../src/billing/plan-resolver";
import {
  verifyRazorpayWebhookSignature,
  razorpayWebhookEventId,
  InMemoryWebhookIdempotencyStore,
} from "../../src/webhook/razorpay-webhook-security";
import crypto from "crypto";

describe("Unagency plan catalog entitlements", () => {
  it("exposes exactly six plan codes", () => {
    expect(PLAN_CODES).toHaveLength(6);
    expect(listCanonicalPlans()).toHaveLength(6);
  });

  it("AI Monthly exact matrix", () => {
    const e = getCanonicalPlan("UNAGENCY_AI_MONTHLY").entitlements;
    expect(e.credits).toBe(3000);
    expect(e.brands).toBe(10);
    expect(e.projectStorageGb).toBe(25);
    expect(e.projects).toBe("unlimited");
    expect(e.unlimitedRevisions).toBe(false);
    expect(e.ssoEnterpriseSecurity).toBe("yes");
  });

  it("Hybrid Monthly exact matrix", () => {
    const e = getCanonicalPlan("UNAGENCY_HYBRID_MONTHLY").entitlements;
    expect(e.credits).toBe(7000);
    expect(e.brands).toBe(10);
    expect(e.projectStorageGb).toBe(25);
    expect(e.humanSupport).toBe(true);
    expect(e.qualityControl).toBe("AI + Human QC");
    expect(e.accountManager).toBe(true);
    expect(e.creativeTeamSupport).toBe(true);
    expect(e.monthlyReports).toBe("Automated Reports");
    expect(e.quarterlyBusinessReview).toBe(false);
  });

  it("Human Monthly exact matrix", () => {
    const e = getCanonicalPlan("UNAGENCY_HUMAN_MONTHLY").entitlements;
    expect(e.credits).toBeNull();
    expect(e.brands).toBe(10);
    expect(e.projectStorageGb).toBe(25);
    expect(e.qualityControl).toBe("Human QC");
    expect(e.accountManager).toBe(true);
    expect(e.creativeTeamSupport).toBe(true);
    expect(e.unlimitedRevisions).toBe(true);
    expect(e.quarterlyBusinessReview).toBe(true);
  });

  it("AI Annual exact matrix", () => {
    const e = getCanonicalPlan("UNAGENCY_AI_ANNUAL").entitlements;
    expect(e.credits).toBe(50000);
    expect(e.brands).toBe(10);
    expect(e.projectStorageGb).toBe(100);
    expect(e.aiMemory).toBe("Advanced Brand Memory");
    expect(e.unlimitedRevisions).toBe(true);
    expect(e.usageAnalytics).toBe("Advanced Analytics");
    expect(e.ssoEnterpriseSecurity).toBe("add_on");
  });

  it("Hybrid Annual exact matrix", () => {
    const e = getCanonicalPlan("UNAGENCY_HYBRID_ANNUAL").entitlements;
    expect(e.credits).toBe(100000);
    expect(e.brands).toBe(10);
    expect(e.projectStorageGb).toBe(100);
    expect(e.qualityControl).toBe("AI + Senior Human QC");
    expect(e.turnaroundTime).toBe("Priority SLA");
    expect(e.accountManager).toBe(true);
    expect(e.creativeTeamSupport).toBe(true);
    expect(e.unlimitedRevisions).toBe(true);
    expect(e.sourceFiles).toBe("Complete Source Files");
    expect(e.monthlyReports).toBe("Human Reviewed Reports");
    expect(e.quarterlyBusinessReview).toBe(true);
  });

  it("Human Annual exact matrix", () => {
    const e = getCanonicalPlan("UNAGENCY_HUMAN_ANNUAL").entitlements;
    expect(e.credits).toBeNull();
    expect(e.brands).toBe(10);
    expect(e.projectStorageGb).toBe(100);
    expect(e.qualityControl).toBe("Senior Human QC");
    expect(e.turnaroundTime).toBe("Priority SLA");
    expect(e.accountManager).toBe(true);
    expect(e.creativeTeamSupport).toBe(false);
    expect(e.unlimitedRevisions).toBe(true);
    expect(e.sourceFiles).toBe("Complete Source Files");
    expect(e.usageAnalytics).toBe("Not Included");
    expect(e.monthlyReports).toBe("Not Included");
    expect(e.quarterlyBusinessReview).toBe(false);
    expect(e.ssoEnterpriseSecurity).toBe("add_on");
  });

  it("uses exact prices (no monthly×12 annual)", () => {
    expect(PLAN_CATALOG.UNAGENCY_AI_MONTHLY.amountInr).toBe(5000);
    expect(PLAN_CATALOG.UNAGENCY_HYBRID_MONTHLY.amountInr).toBe(20000);
    expect(PLAN_CATALOG.UNAGENCY_HUMAN_MONTHLY.amountInr).toBe(50000);
    expect(PLAN_CATALOG.UNAGENCY_AI_ANNUAL.amountInr).toBe(50000);
    expect(PLAN_CATALOG.UNAGENCY_HYBRID_ANNUAL.amountInr).toBe(200000);
    expect(PLAN_CATALOG.UNAGENCY_HUMAN_ANNUAL.amountInr).toBe(500000);
  });

  it("critical accuracy checks from product matrix", () => {
    expect(PLAN_CATALOG.UNAGENCY_AI_MONTHLY.entitlements.unlimitedRevisions).toBe(
      false
    );
    expect(PLAN_CATALOG.UNAGENCY_AI_ANNUAL.entitlements.unlimitedRevisions).toBe(
      true
    );
    expect(
      PLAN_CATALOG.UNAGENCY_HUMAN_MONTHLY.entitlements.creativeTeamSupport
    ).toBe(true);
    expect(
      PLAN_CATALOG.UNAGENCY_HUMAN_ANNUAL.entitlements.creativeTeamSupport
    ).toBe(false);
    expect(
      PLAN_CATALOG.UNAGENCY_HUMAN_MONTHLY.entitlements.quarterlyBusinessReview
    ).toBe(true);
    expect(
      PLAN_CATALOG.UNAGENCY_HYBRID_ANNUAL.entitlements.quarterlyBusinessReview
    ).toBe(true);
  });
});

describe("planCode → Razorpay plan ID resolver", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  beforeEach(() => {
    process.env.RAZORPAY_PLAN_UNAGENCY_AI_MONTHLY = "plan_TZOonVhnrZ269s";
    process.env.RAZORPAY_PLAN_UNAGENCY_HYBRID_MONTHLY = "plan_TZOqRlvVnXUF1F";
    process.env.RAZORPAY_PLAN_UNAGENCY_HUMAN_MONTHLY = "plan_TZOrVbotLTD6rt";
    process.env.RAZORPAY_PLAN_UNAGENCY_AI_ANNUAL = "plan_TZOsNbuPxyYhab";
    process.env.RAZORPAY_PLAN_UNAGENCY_HYBRID_ANNUAL = "plan_TZOtAZgHLmukPN";
    process.env.RAZORPAY_PLAN_UNAGENCY_HUMAN_ANNUAL = "plan_TZOtq1TkrABCnD";
  });

  it("maps all six codes to existing plan IDs", () => {
    expect(resolveRazorpayPlanId("UNAGENCY_AI_MONTHLY")).toBe(
      "plan_TZOonVhnrZ269s"
    );
    expect(resolveRazorpayPlanId("UNAGENCY_HYBRID_MONTHLY")).toBe(
      "plan_TZOqRlvVnXUF1F"
    );
    expect(resolveRazorpayPlanId("UNAGENCY_HUMAN_MONTHLY")).toBe(
      "plan_TZOrVbotLTD6rt"
    );
    expect(resolveRazorpayPlanId("UNAGENCY_AI_ANNUAL")).toBe(
      "plan_TZOsNbuPxyYhab"
    );
    expect(resolveRazorpayPlanId("UNAGENCY_HYBRID_ANNUAL")).toBe(
      "plan_TZOtAZgHLmukPN"
    );
    expect(resolveRazorpayPlanId("UNAGENCY_HUMAN_ANNUAL")).toBe(
      "plan_TZOtq1TkrABCnD"
    );
  });

  it("rejects invalid plan codes", () => {
    expect(isPlanCode("plan_TZOonVhnrZ269s")).toBe(false);
    expect(() => resolveActivePlanFromCode("plan_TZOonVhnrZ269s")).toThrow();
  });
});

describe("Razorpay webhook security + idempotency", () => {
  const secret = "whsec_test";

  function sign(body: string) {
    return crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  it("accepts valid signatures and rejects invalid", () => {
    const body = JSON.stringify({ event: "subscription.activated" });
    expect(
      verifyRazorpayWebhookSignature({
        rawBody: body,
        signature: sign(body),
        secret,
      })
    ).toBe(true);
    expect(
      verifyRazorpayWebhookSignature({
        rawBody: body,
        signature: "deadbeef",
        secret,
      })
    ).toBe(false);
  });

  it("dedupes duplicate event IDs", async () => {
    const store = new InMemoryWebhookIdempotencyStore();
    const event = {
      event: "subscription.charged",
      created_at: 1,
      payload: { subscription: { entity: { id: "sub_1" } } },
    };
    const id = razorpayWebhookEventId(event);
    expect(await store.tryClaim(id)).toBe("new");
    expect(await store.tryClaim(id)).toBe("duplicate");
  });

  it("builds stable event ids for subscription lifecycle events", () => {
    const events = [
      "subscription.authenticated",
      "subscription.activated",
      "subscription.charged",
      "subscription.pending",
      "subscription.halted",
      "subscription.cancelled",
      "subscription.completed",
      "subscription.expired",
      "subscription.paused",
      "subscription.resumed",
      "subscription.updated",
    ];
    for (const name of events) {
      const id = razorpayWebhookEventId({
        event: name,
        created_at: 42,
        payload: { subscription: { entity: { id: "sub_x" } } },
      });
      expect(id).toContain(name);
      expect(id).toContain("sub_x");
    }
  });
});
