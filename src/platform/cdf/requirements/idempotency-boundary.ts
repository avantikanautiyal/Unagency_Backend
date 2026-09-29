/**
 * M1B hardening observation — idempotency domain boundary (M2).
 *
 * Today: `CdfSessionState.lastRequestKey` is a single-slot replay marker.
 * Future: persist multiple historical request identities without breaking M1B.
 *
 * Do NOT implement a distributed idempotency store in M2.
 */

import type { CdfActionRequestBoundary } from "./types";

export const CDF_ACTION_IDEMPOTENCY_BOUNDARY: CdfActionRequestBoundary = {
  futureRecordShape: "CdfActionRequest / IdempotencyRecord",
  fields: [
    "requestId",
    "sessionId",
    "expectedVersion",
    "action",
    "fingerprint",
    "resultSessionVersion",
    "createdAt",
  ],
};

/**
 * Conceptual future record — type-only documentation for later phases.
 */
export type CdfActionIdempotencyRecord = {
  requestId: string;
  sessionId: string;
  expectedVersion: number;
  action: string;
  fingerprint: string;
  resultSessionVersion: number;
  createdAt: string;
};
