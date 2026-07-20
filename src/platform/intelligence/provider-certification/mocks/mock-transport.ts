/**
 * Mock transport — no networking.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalProviderRequest } from "../../providers/transport/contracts/canonical";
import type { CanonicalProviderResponse } from "../../providers/transport/contracts/canonical";

export interface IMockTransport {
  dispatch(request: CanonicalProviderRequest): Result<CanonicalProviderResponse>;
}

export class MockTransport implements IMockTransport {
  dispatch(request: CanonicalProviderRequest): Result<CanonicalProviderResponse> {
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      payload: { mock: true, echoed: request.payload },
      latencyMs: 3,
      createdAt: new Date().toISOString(),
    });
  }
}
