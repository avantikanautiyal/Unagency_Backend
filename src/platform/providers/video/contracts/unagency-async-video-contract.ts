/**
 * UNAGENCY repository-defined async video API contract (v1).
 * Used for certification and fake HTTP transport until vendor wire APIs are verified.
 * Do NOT treat this as a vendor API — provider leaves map catalog baseUrl + this contract in test mode.
 */

export const UNAGENCY_ASYNC_VIDEO_CONTRACT_V1 = {
  version: "unagency-async-video-v1",
  submitMethod: "POST" as const,
  submitPath: "/v1/async/video/jobs",
  pollMethod: "GET" as const,
  pollPathTemplate: "/v1/async/video/jobs/{jobId}",
  cancelMethod: "POST" as const,
  cancelPathTemplate: "/v1/async/video/jobs/{jobId}/cancel",
  idempotencyHeader: "Idempotency-Key",
  authHeader: "Authorization",
  authScheme: "Bearer" as const,
} as const;

export type UnagencyAsyncVideoContract = typeof UNAGENCY_ASYNC_VIDEO_CONTRACT_V1;

export function pollPathForJob(contract: UnagencyAsyncVideoContract, jobId: string): string {
  return contract.pollPathTemplate.replace("{jobId}", encodeURIComponent(jobId));
}

export function cancelPathForJob(contract: UnagencyAsyncVideoContract, jobId: string): string {
  return contract.cancelPathTemplate.replace("{jobId}", encodeURIComponent(jobId));
}
