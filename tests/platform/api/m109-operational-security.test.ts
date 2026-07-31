/**
 * M10.9 — Razorpay webhook signature + idempotency (no live payments).
 */

import crypto from "crypto";
import {
  InMemoryWebhookIdempotencyStore,
  razorpayWebhookEventId,
  verifyRazorpayWebhookSignature,
} from "../../../src/webhook/razorpay-webhook-security";

describe("M10.9 Razorpay webhook security", () => {
  const secret = "whsec_test_m109";

  it("accepts valid HMAC signatures", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1" } } },
      created_at: 1,
    });
    const signature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    expect(
      verifyRazorpayWebhookSignature({ rawBody: body, signature, secret })
    ).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      verifyRazorpayWebhookSignature({
        rawBody: "{}",
        signature: "deadbeef",
        secret,
      })
    ).toBe(false);
  });

  it("idempotency store claims once", async () => {
    const store = new InMemoryWebhookIdempotencyStore();
    const id = razorpayWebhookEventId({
      event: "subscription.activated",
      payload: { subscription: { entity: { id: "sub_1" } } },
      created_at: 42,
    });
    expect(await store.tryClaim(id)).toBe("new");
    expect(await store.tryClaim(id)).toBe("duplicate");
  });
});
