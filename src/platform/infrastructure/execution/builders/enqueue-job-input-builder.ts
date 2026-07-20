/**
 * Enqueue request builder.
 */

import type { EnqueueJobInput, ExecutionJobPayload } from "../contracts/job";
import type { JobPriority, QueueKind } from "../contracts/enums";
import type { RetryPolicy } from "../contracts/job";

export class EnqueueJobInputBuilder {
  private payload: ExecutionJobPayload = { rawPrompt: "" };
  private queueKind?: QueueKind;
  private priority?: JobPriority;
  private retryPolicy?: Partial<RetryPolicy>;
  private scheduledAt?: string;

  static create(): EnqueueJobInputBuilder {
    return new EnqueueJobInputBuilder();
  }

  withPrompt(rawPrompt: string): this {
    this.payload = { ...this.payload, rawPrompt };
    return this;
  }

  withOrganization(organizationId: string): this {
    this.payload = { ...this.payload, organizationId };
    return this;
  }

  withWorkspace(workspaceId: string): this {
    this.payload = { ...this.payload, workspaceId };
    return this;
  }

  withScenarioHint(scenarioHint: string): this {
    this.payload = { ...this.payload, scenarioHint };
    return this;
  }

  withQueueKind(queueKind: QueueKind): this {
    this.queueKind = queueKind;
    return this;
  }

  withPriority(priority: JobPriority): this {
    this.priority = priority;
    return this;
  }

  withRetryPolicy(retryPolicy: Partial<RetryPolicy>): this {
    this.retryPolicy = retryPolicy;
    return this;
  }

  withScheduledAt(scheduledAt: string): this {
    this.scheduledAt = scheduledAt;
    return this;
  }

  withMetadata(metadata: Record<string, unknown>): this {
    this.payload = { ...this.payload, metadata };
    return this;
  }

  build(): EnqueueJobInput {
    return {
      payload: this.payload,
      queueKind: this.queueKind,
      priority: this.priority,
      retryPolicy: this.retryPolicy,
      scheduledAt: this.scheduledAt,
    };
  }
}
