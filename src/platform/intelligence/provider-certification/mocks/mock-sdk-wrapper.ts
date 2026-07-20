/**
 * Mock SDK wrapper — interface compliance without vendor SDK.
 */

import { success, type Result } from "../../shared/result";
import type { SdkRequest, SdkResponse } from "../../providers/sdk/contracts/request-response";
import type { SdkHealth } from "../../providers/sdk/contracts/health-result";

export interface IMockSdkWrapper {
  readonly vendor: string;
  execute(request: SdkRequest): Result<SdkResponse>;
  health(): Result<SdkHealth>;
}

export class MockSdkWrapper implements IMockSdkWrapper {
  readonly vendor: string;

  constructor(vendor = "mock") {
    this.vendor = vendor;
  }

  execute(request: SdkRequest): Result<SdkResponse> {
    return success({
      requestId: request.requestId,
      payload: {
        id: "mock_sdk_resp",
        output: { text: "mock response" },
      },
      latencyMs: 5,
      createdAt: new Date().toISOString(),
    });
  }

  health(): Result<SdkHealth> {
    return success({
      vendor: this.vendor,
      state: "healthy",
      checkedAt: new Date().toISOString(),
    });
  }
}
