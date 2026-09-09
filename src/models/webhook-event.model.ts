import mongoose, { Schema } from "mongoose";

/**
 * Durable Razorpay webhook idempotency — survives process restarts.
 */
export interface IWebhookEvent {
  _id: mongoose.Types.ObjectId;
  eventId: string;
  eventType: string;
  processed: boolean;
  processedAt?: Date;
  payloadSummary?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    processed: { type: Boolean, default: false },
    processedAt: { type: Date },
    payloadSummary: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true, collection: "razorpay_webhook_events" }
);

export const WebhookEventModel = mongoose.model<IWebhookEvent>(
  "RazorpayWebhookEvents",
  WebhookEventSchema
);

export class MongoWebhookIdempotencyStore {
  async tryClaim(eventId: string, eventType = "unknown"): Promise<"new" | "duplicate"> {
    try {
      await WebhookEventModel.create({
        eventId,
        eventType,
        processed: false,
      });
      return "new";
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: number }).code === 11000
      ) {
        return "duplicate";
      }
      throw err;
    }
  }

  async markProcessed(
    eventId: string,
    payloadSummary?: Record<string, unknown>
  ): Promise<void> {
    await WebhookEventModel.updateOne(
      { eventId },
      {
        $set: {
          processed: true,
          processedAt: new Date(),
          ...(payloadSummary ? { payloadSummary } : {}),
        },
      }
    );
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    await WebhookEventModel.updateOne(
      { eventId },
      { $set: { error: error.slice(0, 2000) } }
    );
  }
}

export const mongoWebhookIdempotencyStore = new MongoWebhookIdempotencyStore();
