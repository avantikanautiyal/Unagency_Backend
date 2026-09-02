/**
 * Canonical performance evidence for closed-loop adaptive routing (M9.5H).
 * Never stores credentials, prompts, base64, signed URLs, or vendor auth headers.
 */

export type AttemptRoutePosition = "primary" | "failover";

export type PerformanceFailureCategory =
  | "timeout"
  | "rate_limit"
  | "quota"
  | "provider_internal"
  | "unavailable"
  | "circuit_open"
  | "content_policy"
  | "invalid_request"
  | "tenant_violation"
  | "invalid_asset"
  | "unsupported_capability"
  | "authentication"
  | "configuration"
  | "infrastructure"
  | "unknown"
  | "none";

export interface PerformanceEvidence {
  readonly evidenceId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly organizationId: string;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly modelId: string;

  readonly routingDecisionId?: string;
  readonly positionInRoute: number;
  readonly primaryOrFailover: AttemptRoutePosition;
  readonly exploratory?: boolean;

  readonly startedAt: string;
  readonly completedAt: string;
  readonly latencyMs: number;

  readonly success: boolean;
  readonly failureCategory: PerformanceFailureCategory;

  readonly evaluationScore?: number;
  readonly evaluationDimensions?: Readonly<Record<string, number>>;

  /**
   * M9.5P — only feedbackEligible quality scores may influence adaptive QUALITY routing.
   * Technical/compliance validations must set feedbackEligible=false.
   */
  readonly feedbackEligible?: boolean;
  readonly evaluationTrust?: "high" | "medium" | "low" | "none";
  readonly evaluationMethod?:
    | "deterministic"
    | "model_judge"
    | "heuristic"
    | "benchmark"
    | "human"
    | "none";
  readonly evaluationStatus?:
    | "evaluated"
    | "partially_evaluated"
    | "not_supported"
    | "unavailable"
    | "failed";
  readonly judgeId?: string;
  readonly judgeVersion?: string;
  readonly rubricVersion?: string;
  readonly evaluationExclusionReason?: string;
  /** QUALITY | COMPLIANCE | RELIABILITY | … */
  readonly evaluationMetricNamespace?: string;

  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;

  readonly imagesGenerated?: number;
  readonly videoSeconds?: number;
  readonly computeUnits?: number;

  /** Only when pricing metadata is trustworthy; otherwise null/omitted. */
  readonly estimatedCost?: number | null;

  /**
   * M9.5Q — only costEligible amounts may influence economic routing.
   * Unknown/unverified pricing must leave estimatedCost null and costEligible false.
   */
  readonly costEligible?: boolean;
  readonly costCurrency?: string | null;
  readonly pricingVersion?: string | null;
  readonly costStatus?:
    | "calculated"
    | "partially_calculated"
    | "unknown"
    | "unavailable"
    | "not_applicable";
  readonly costMethod?:
    | "provider_reported"
    | "pricing_catalogue"
    | "contract_rate"
    | "none";
  readonly costTrust?: "high" | "medium" | "low" | "none";

  readonly retryCount: number;
  readonly timeoutOccurred: boolean;
  readonly rateLimited: boolean;

  readonly artifactIds?: readonly string[];

  /** True when failure is UNAGENCY infra (Mongo/S3/post-process), not provider. */
  readonly infrastructureFailure?: boolean;

  readonly recordedAt: string;
}

export interface AdaptiveRoutingExplain {
  readonly staticScore: number;
  readonly performanceScore: number;
  readonly qualityScore: number;
  readonly latencyScore: number;
  readonly costScore: number;
  readonly healthAdjustment: number;
  readonly policyAdjustment: number;
  readonly finalScore: number;
  readonly sampleCount: number;
  readonly usedAdaptiveFeedback: boolean;
  readonly exploratory?: boolean;
  readonly coldStart: boolean;
}
