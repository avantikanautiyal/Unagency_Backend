/**
 * Model limits contracts.
 */

export interface ModelLimits {
  readonly maximumContext: number;
  readonly maximumOutput: number;
  readonly maximumInputTokens?: number;
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
}
