/**
 * Deterministic fake video HTTP client — zero network for M9.5E certification.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { VideoProviderConfig } from "../contracts/video-provider-config";
import {
  cancelPathForJob,
  pollPathForJob,
  type UnagencyAsyncVideoContract,
} from "../contracts/unagency-async-video-contract";
import type { IVideoHttpClient, VideoHttpRequest, VideoHttpResponse } from "./video-http-client";

interface FakeVideoJob {
  pollsRemaining: number;
  cancelled: boolean;
  failed: boolean;
  outputs: readonly Record<string, unknown>[];
}

export class FakeVideoHttpClient implements IVideoHttpClient {
  readonly submitCount = new Map<string, number>();
  readonly pollCount = new Map<string, number>();
  private readonly jobs = new Map<string, FakeVideoJob>();
  private readonly idempotencyToJob = new Map<string, string>();
  private jobSeq = 0;

  constructor(
    private readonly config: VideoProviderConfig,
    private readonly contract: UnagencyAsyncVideoContract,
    private readonly pollsBeforeComplete = 2,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: VideoHttpRequest): Promise<Result<VideoHttpResponse>> {
    const start = this.clockMs();
    const latencyMs = 5;

    if (request.method === "POST" && request.path === this.contract.submitPath) {
      const idempotencyKey = request.headers?.[this.contract.idempotencyHeader.toLowerCase()] ??
        request.headers?.[this.contract.idempotencyHeader];
      if (idempotencyKey) {
        const existing = this.idempotencyToJob.get(idempotencyKey);
        if (existing) {
          return success(this.buildSubmitResponse(existing, start, latencyMs));
        }
        this.submitCount.set(idempotencyKey, (this.submitCount.get(idempotencyKey) ?? 0) + 1);
      } else {
        const key = `anon_${++this.jobSeq}`;
        this.submitCount.set(key, 1);
      }

      const jobId = `vid_job_${this.config.vendor}_${++this.jobSeq}`;
      if (idempotencyKey) this.idempotencyToJob.set(idempotencyKey, jobId);

      const resultUrl = `https://cdn.example.test/${this.config.vendor}/${jobId}.mp4`;
      this.jobs.set(jobId, {
        pollsRemaining: this.pollsBeforeComplete,
        cancelled: false,
        failed: false,
        outputs: [
          {
            index: 0,
            type: "video",
            mimeType: "video/mp4",
            temporaryUrl: resultUrl,
            width: 1280,
            height: 720,
            durationSeconds: 4,
          },
        ],
      });

      return success(this.buildSubmitResponse(jobId, start, latencyMs));
    }

    if (request.method === "GET" && request.path.startsWith("/v1/async/video/jobs/")) {
      const jobId = decodeURIComponent(request.path.split("/").pop() ?? "");
      const job = this.jobs.get(jobId);
      if (!job) {
        return failure(new ValidationError(`Unknown fake video job ${jobId}`));
      }
      this.pollCount.set(jobId, (this.pollCount.get(jobId) ?? 0) + 1);

      if (job.cancelled) {
        return success({
          status: 200,
          headers: {},
          body: { jobId, status: "cancelled" },
          latencyMs,
        });
      }
      if (job.failed) {
        return success({
          status: 200,
          headers: {},
          body: { jobId, status: "failed", error: { code: "content_policy", message: "rejected" } },
          latencyMs,
        });
      }
      if (job.pollsRemaining > 0) {
        job.pollsRemaining -= 1;
        return success({
          status: 200,
          headers: { "retry-after": "1" },
          body: { jobId, status: "processing" },
          latencyMs,
        });
      }

      return success({
        status: 200,
        headers: {},
        body: {
          jobId,
          status: "completed",
          outputs: job.outputs,
          usage: { videoSeconds: 4, computeUnits: 1 },
        },
        latencyMs,
      });
    }

    if (request.method === "POST") {
      const cancelPath = cancelPathForJob(this.contract, request.path.split("/").slice(-2)[0] ?? "");
      if (request.path.endsWith("/cancel") || request.path === cancelPath) {
        const jobId = request.path.split("/").slice(-2, -1)[0] ?? "";
        const job = this.jobs.get(jobId);
        if (job) job.cancelled = true;
        return success({ status: 200, headers: {}, body: { jobId, status: "cancelled" }, latencyMs });
      }
    }

    return failure(new ValidationError(`Unhandled fake video HTTP ${request.method} ${request.path}`));
  }

  private buildSubmitResponse(jobId: string, start: number, latencyMs: number): VideoHttpResponse {
    return {
      status: 202,
      headers: {},
      body: { jobId, status: "pending" },
      latencyMs: this.clockMs() - start + latencyMs,
    };
  }

  pollPath(jobId: string): string {
    return pollPathForJob(this.contract, jobId);
  }
}
