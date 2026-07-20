/**
 * Request builder for multi-provider rollout.
 */

import type { MultiProviderRolloutRequest, RolloutMode } from "../contracts";

export class MultiProviderRolloutRequestBuilder {
  private requestId = "";
  private providerIds?: readonly string[];
  private mode?: RolloutMode;
  private publishObservability?: boolean;
  private requireCertificationForActive?: boolean;

  static create(): MultiProviderRolloutRequestBuilder {
    return new MultiProviderRolloutRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withProviderIds(ids: readonly string[]): this {
    this.providerIds = ids;
    return this;
  }

  withMode(mode: RolloutMode): this {
    this.mode = mode;
    return this;
  }

  withPublishObservability(v: boolean): this {
    this.publishObservability = v;
    return this;
  }

  withRequireCertification(v: boolean): this {
    this.requireCertificationForActive = v;
    return this;
  }

  build(): MultiProviderRolloutRequest {
    return {
      requestId: this.requestId,
      providerIds: this.providerIds,
      mode: this.mode,
      publishObservability: this.publishObservability,
      requireCertificationForActive: this.requireCertificationForActive,
    };
  }
}
