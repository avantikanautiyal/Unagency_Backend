/**
 * Pure Razorpay webhook helpers (M10.9) — credential-free unit testable.
 */

import crypto from "crypto";

export function verifyRazorpayWebhookSignature(input: {
  readonly rawBody: string | Buffer;
  readonly signature: string | undefined;
  readonly secret: string;
}): boolean {
  if (!input.signature || !input.secret) return false;
  const body =
    typeof input.rawBody === "string"
      ? input.rawBody
      : input.rawBody.toString("utf8");
  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(String(input.signature), "utf8")
    );
  } catch {
    return false;
  }
}

export function razorpayWebhookEventId(event: {
  readonly event?: string;
  readonly payload?: unknown;
  readonly created_at?: number;
}): string {
  const payload = event.payload as
    | {
        payment?: { entity?: { id?: string } };
        subscription?: { entity?: { id?: string } };
      }
    | undefined;
  const paymentId = payload?.payment?.entity?.id;
  const subscriptionId = payload?.subscription?.entity?.id;
  const name = event.event ?? "unknown";
  const created = event.created_at ?? 0;
  return `${name}:${paymentId ?? subscriptionId ?? "none"}:${created}`;
}

/** In-process idempotency for tests / single-process; Mongo-backed store preferred in prod. */
export class InMemoryWebhookIdempotencyStore {
  private readonly seen = new Set<string>();

  async tryClaim(eventId: string): Promise<"new" | "duplicate"> {
    if (this.seen.has(eventId)) return "duplicate";
    this.seen.add(eventId);
    return "new";
  }

  clear(): void {
    this.seen.clear();
  }
}

export const defaultWebhookIdempotencyStore =
  new InMemoryWebhookIdempotencyStore();
