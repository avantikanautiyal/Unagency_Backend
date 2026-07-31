/**
 * Deterministic fake async provider for M9.5D certification — zero network.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import { asProviderId } from "../../../shared/identifiers";
import type { ProviderId } from "../../../shared/identifiers";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type {
  IAsyncProviderDispatcher,
  ProviderExecutionSemantics,
} from "../interfaces/async-provider-dispatcher";
import type {
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
  ProviderOperationMediaOutput,
} from "../contracts/provider-operation";

export type FakeAsyncScenario =
  | "immediate_complete"
  | "pending_then_complete"
  | "pending_then_fail"
  | "poll_rate_limit"
  | "multi_output"
  | "cancel_supported";

interface FakeJobState {
  readonly scenario: FakeAsyncScenario;
  readonly pollsBeforeComplete: number;
  pollCount: number;
  readonly outputs: readonly ProviderOperationMediaOutput[];
  cancelled: boolean;
  rateLimitPollsRemaining: number;
}

export class FakeAsyncProviderDispatcher implements IAsyncProviderDispatcher {
  readonly submissionCount = new Map<string, number>();
  readonly pollCount = new Map<string, number>();
  readonly cancelCount = new Map<string, number>();
  private readonly jobs = new Map<string, FakeJobState>();
  private readonly idempotencyToJobId = new Map<string, string>();
  private jobSeq = 0;

  constructor(
    private readonly providerId: string = "provider.fake-async",
    private readonly scenario: FakeAsyncScenario = "pending_then_complete",
    private readonly pollsBeforeComplete = 2,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  executionSemantics(): ProviderExecutionSemantics {
    return "async";
  }

  supportsStreaming(_providerId: ProviderId): boolean {
    return false;
  }

  supportsCancellation(_providerId: ProviderId): boolean {
    return this.scenario === "cancel_supported";
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    return failure(
      new ValidationError("Fake async provider does not support sync dispatch")
    );
  }

  async submitAsync(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
    idempotencyKey: string
  ): Promise<Result<ProviderAsyncSubmitResult>> {
    const existingJobId = this.idempotencyToJobId.get(idempotencyKey);
    if (existingJobId) {
      const job = this.jobs.get(existingJobId);
      if (job) {
        const completed =
          this.scenario === "immediate_complete" ||
          job.pollCount >= job.pollsBeforeComplete;
        if (this.scenario === "immediate_complete" || !completed) {
          return success({
            providerJobId: existingJobId,
            status: completed ? "completed" : "pending",
            outputs: completed ? job.outputs : undefined,
            usage: completed ? { computeUnits: 1 } : undefined,
            safeMetadata: { scenario: this.scenario, idempotent: true },
          });
        }
      }
    }

    const prior = this.submissionCount.get(idempotencyKey) ?? 0;
    this.submissionCount.set(idempotencyKey, prior + 1);

    const providerJobId = `fake_job_${++this.jobSeq}`;
    this.idempotencyToJobId.set(idempotencyKey, providerJobId);
    const outputs = this.buildOutputs(request, this.scenario === "multi_output" ? 3 : 1);

    if (this.scenario === "immediate_complete") {
      this.jobs.set(providerJobId, {
        scenario: this.scenario,
        pollsBeforeComplete: 0,
        pollCount: 0,
        outputs,
        cancelled: false,
        rateLimitPollsRemaining: 0,
      });
      return success({
        providerJobId,
        status: "completed",
        outputs,
        usage: { computeUnits: 1 },
        safeMetadata: { scenario: this.scenario },
      });
    }

    this.jobs.set(providerJobId, {
      scenario: this.scenario,
      pollsBeforeComplete: this.pollsBeforeComplete,
      pollCount: 0,
      outputs,
      cancelled: false,
      rateLimitPollsRemaining: this.scenario === "poll_rate_limit" ? 1 : 0,
    });

    return success({
      providerJobId,
      status: "pending",
      safeMetadata: { scenario: this.scenario },
    });
  }

  async pollAsync(
    _request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<ProviderAsyncPollResult>> {
    const job = this.jobs.get(providerJobId);
    if (!job) return failure(new ValidationError("Unknown fake provider job"));

    const polls = (this.pollCount.get(providerJobId) ?? 0) + 1;
    this.pollCount.set(providerJobId, polls);
    job.pollCount = polls;

    if (job.cancelled) {
      return success({ status: "cancelled", errorCode: "cancelled" });
    }

    if (job.rateLimitPollsRemaining > 0) {
      job.rateLimitPollsRemaining -= 1;
      return success({
        status: "pending",
        nextPollAfterMs: 500,
        errorCode: "rate_limit",
        errorMessage: "temporary poll rate limit",
      });
    }

    if (job.scenario === "pending_then_fail" && job.pollCount >= job.pollsBeforeComplete) {
      return success({
        status: "failed",
        errorCode: "provider_job_failed",
        errorMessage: "simulated provider job failure",
      });
    }

    if (job.pollCount < job.pollsBeforeComplete) {
      return success({ status: "pending", nextPollAfterMs: 100 });
    }

    return success({
      status: "completed",
      outputs: job.outputs,
      usage: { computeUnits: 1, videoSeconds: 0 },
    });
  }

  async cancelAsync(
    _request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<void>> {
    const job = this.jobs.get(providerJobId);
    if (!job) return failure(new ValidationError("Unknown fake provider job"));
    job.cancelled = true;
    this.cancelCount.set(providerJobId, (this.cancelCount.get(providerJobId) ?? 0) + 1);
    return success(undefined);
  }

  getSubmissionCount(idempotencyKey: string): number {
    return this.submissionCount.get(idempotencyKey) ?? 0;
  }

  private buildOutputs(
    request: ProviderExecutionRequest,
    count: number
  ): readonly ProviderOperationMediaOutput[] {
    const capabilityId = String(request.capabilityId ?? "");
    const isVideo =
      capabilityId.startsWith("video.") || capabilityId === "video.generate";
    const outputs: ProviderOperationMediaOutput[] = [];
    for (let i = 0; i < count; i++) {
      outputs.push({
        index: i,
        type: isVideo ? "video" : "image",
        mimeType: isVideo ? "video/mp4" : "image/png",
        temporaryUrl: isVideo
          ? `https://cdn.example.test/fake/${request.requestId}/${i}.mp4`
          : `https://cdn.example.test/fake/${request.requestId}/${i}.png`,
        metadata: { fake: true },
      });
    }
    return outputs;
  }
}

export function fakeAsyncProviderId(): ProviderId {
  return asProviderId("provider.fake-async");
}
