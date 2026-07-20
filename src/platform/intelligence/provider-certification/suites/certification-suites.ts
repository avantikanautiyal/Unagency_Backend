/**
 * Certification suite registry — all suites wired.
 */

import { BaseCertificationSuite } from "./base-suite";
import {
  validateRequestValidation,
  validateResponseValidation,
} from "../validators/request-response-validator";
import { validateStreaming } from "../streaming/streaming-validator";
import {
  validateToolCalling,
  validateFunctionCalling,
} from "../function-calling/function-calling-validator";
import { validateStructuredJsonOutput } from "../structured-output/structured-output-validator";
import {
  validateTokenAccounting,
  validateContextWindow,
} from "../tokenization/tokenization-validator";
import {
  validateErrorNormalization,
  validateRetryBehaviour,
  validateTimeoutBehaviour,
  validateCircuitBreakerCompatibility,
  validateCancellation,
} from "../errors/error-validator";
import {
  validateObservability,
  validateLogging,
  validateMetrics,
  validateHealthReporting,
  validateDiagnostics,
} from "../observability/observability-validator";
import {
  validateAuthenticationContract,
  validateRegionHandling,
  validateCostReporting,
} from "../security/security-validator";
import {
  validateCapabilityManifest,
  validateModelDiscovery,
  validateModelMetadata,
  validatePerformance,
} from "../conformance/manifest-validator";
import type { ICertificationSuite } from "../interfaces/certification";

export function createCertificationSuites(
  createId: (prefix: string) => string,
  clockMs: () => number
): readonly ICertificationSuite[] {
  return [
    new BaseCertificationSuite(
      "conformance",
      ["request_validation", "response_validation", "capability_manifest", "model_discovery", "model_metadata"],
      {
        request_validation: validateRequestValidation,
        response_validation: validateResponseValidation,
        capability_manifest: validateCapabilityManifest,
        model_discovery: validateModelDiscovery,
        model_metadata: validateModelMetadata,
      },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "streaming",
      ["streaming"],
      { streaming: validateStreaming },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "function_calling",
      ["tool_calling", "function_calling"],
      {
        tool_calling: validateToolCalling,
        function_calling: validateFunctionCalling,
      },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "structured_output",
      ["structured_json_output"],
      { structured_json_output: validateStructuredJsonOutput },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "tokenization",
      ["token_accounting", "context_window_validation"],
      {
        token_accounting: validateTokenAccounting,
        context_window_validation: validateContextWindow,
      },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "errors",
      [
        "error_normalization",
        "retry_behaviour",
        "timeout_behaviour",
        "circuit_breaker_compatibility",
        "cancellation",
      ],
      {
        error_normalization: validateErrorNormalization,
        retry_behaviour: validateRetryBehaviour,
        timeout_behaviour: validateTimeoutBehaviour,
        circuit_breaker_compatibility: validateCircuitBreakerCompatibility,
        cancellation: validateCancellation,
      },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "observability",
      ["observability", "logging", "metrics", "health_reporting", "diagnostics"],
      {
        observability: validateObservability,
        logging: validateLogging,
        metrics: validateMetrics,
        health_reporting: validateHealthReporting,
        diagnostics: validateDiagnostics,
      },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "security",
      ["authentication_contract", "region_handling", "cost_reporting"],
      {
        authentication_contract: validateAuthenticationContract,
        region_handling: validateRegionHandling,
        cost_reporting: validateCostReporting,
      },
      createId,
      clockMs
    ),
    new BaseCertificationSuite(
      "performance",
      ["performance"],
      { performance: validatePerformance },
      createId,
      clockMs
    ),
  ];
}
