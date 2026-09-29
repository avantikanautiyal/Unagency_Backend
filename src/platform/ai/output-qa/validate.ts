/**
 * Phase 16 — Main Output QA entry (post-execution only).
 */

import type { ActionDefinition } from "../action-registry";
import type { ActionExecutionResult } from "../action-execution";
import {
  extractArtifactFromExecutionValue,
  validateProvidedArtifactSchema,
} from "./adapters/artifact";
import { emitOutputQATrace } from "./trace";
import type {
  CanonicalOutputQAInput,
  CanonicalOutputQAResult,
  OutputQACheckId,
  OutputQADiagnostic,
  OutputQAStatus,
} from "./types";
import { OUTPUT_QA_CONTRACT_VERSION } from "./types";

function finish(
  status: OutputQAStatus,
  action: ActionDefinition,
  executionResult: ActionExecutionResult,
  diagnostics: OutputQADiagnostic[],
  checksPerformed: OutputQACheckId[],
  metadata: Record<string, unknown>,
  validatedResult?: unknown,
  allowUnvalidatedContinuation = false,
): CanonicalOutputQAResult {
  const mayAdvance =
    status === "VALID" ||
    (status === "UNSUPPORTED" && allowUnvalidatedContinuation);
  const result: CanonicalOutputQAResult = {
    status,
    actionId: action.actionId,
    actionVersion: action.version,
    outputKind: action.outputContract.kind,
    executionId: executionResult.executionId,
    correlationId: executionResult.correlationId,
    validatedResult,
    diagnostics,
    checksPerformed,
    mayAdvance,
    metadata: {
      ...metadata,
      outputQaContractVersion: OUTPUT_QA_CONTRACT_VERSION,
      promptMutated: false,
      cmrMutated: false,
      providerCalled: false,
      artifactLookupPerformed: false,
      referenceResolved: false,
      conversationRetrieved: false,
      autoRepaired: false,
    },
  };
  emitOutputQATrace(result);
  return result;
}

/**
 * Validate an ActionExecutionResult against the ActionDefinition output contract.
 * Reuses existing CDF/artifact validators. Never repairs or calls providers.
 */
export function validateCanonicalActionOutput(
  input: CanonicalOutputQAInput,
): CanonicalOutputQAResult {
  const { action, executionResult, context = {}, policy = {} } = input;
  const allowUnvalidated = context.allowUnvalidatedContinuation === true;
  const diagnostics: OutputQADiagnostic[] = [];
  const checks: OutputQACheckId[] = ["action_identity", "action_version"];
  const meta: Record<string, unknown> = {
    cdfPhaseId: context.expectedPhaseId,
    serviceId: context.expectedServiceId,
  };

  // Failed execution → cannot be VALID output
  if (!executionResult.ok) {
    checks.push("execution_ok");
    diagnostics.push({
      code: "EXECUTION_FAILED",
      severity: "error",
      message: executionResult.message,
      authoritativeSource: "ActionExecutionResult",
    });
    diagnostics.push({
      code: "OUTPUT_MISSING",
      severity: "error",
      message: "No successful execution result to validate",
      authoritativeSource: "ActionExecutionResult",
    });
    return finish(
      "INVALID",
      action,
      executionResult,
      diagnostics,
      checks,
      meta,
      undefined,
      allowUnvalidated,
    );
  }

  checks.push("execution_ok");

  // Action identity / version must match
  if (executionResult.actionId !== action.actionId) {
    diagnostics.push({
      code: "OUTPUT_CONTRACT_MISMATCH",
      severity: "error",
      message: "execution actionId does not match ActionDefinition",
      fieldPath: "actionId",
      authoritativeSource: "ActionDefinition",
    });
  }
  if (executionResult.actionVersion !== action.version) {
    diagnostics.push({
      code: "OUTPUT_CONTRACT_MISMATCH",
      severity: "error",
      message: "execution actionVersion does not match ActionDefinition",
      fieldPath: "actionVersion",
      authoritativeSource: "ActionDefinition",
    });
  }

  const payload = executionResult.result;
  checks.push("output_kind", "output_contract");

  const expectedKind = action.outputContract.kind;
  // Map execution kinds that are aliases of contract kinds
  const actualKind = payload.kind;
  const kindCompatible =
    actualKind === expectedKind ||
    (expectedKind === "export_result" && actualKind === "render_result") ||
    (expectedKind === "cdf_transition_result" &&
      (actualKind === "selection" ||
        actualKind === "approval" ||
        actualKind === "export_result" ||
        actualKind === "cdf_transition_result"));

  if (!kindCompatible && expectedKind !== "none") {
    // selection/approval actions may declare those kinds while execution returns same
    if (
      !(
        (expectedKind === "selection" && actualKind === "selection") ||
        (expectedKind === "approval" && actualKind === "approval")
      )
    ) {
      diagnostics.push({
        code: "OUTPUT_KIND_MISMATCH",
        severity: "error",
        message: `Expected output kind ${expectedKind}, got ${actualKind}`,
        fieldPath: "result.kind",
        authoritativeSource: "ActionDefinition.outputContract",
      });
    }
  }

  if (context.upstreamRequired && context.upstreamPresent === false) {
    checks.push("upstream_presence");
    diagnostics.push({
      code: "REQUIRED_UPSTREAM_MISSING",
      severity: "error",
      message: "Required upstream ArtifactVersion pin is missing",
      authoritativeSource: "CDF phase dependencies",
    });
  }

  // Class-D generation: deep ArtifactVersion QA unsupported
  if (
    action.executionMode === "MODEL_GENERATION" &&
    action.metadata.artifactContinuityComplete === false &&
    policy.requireArtifactPersistence === true
  ) {
    checks.push("class_d_limitation");
    diagnostics.push({
      code: "UNSUPPORTED_VALIDATION",
      severity: "error",
      message:
        "Class-D service lacks deep ArtifactVersion continuity — artifact QA unsupported",
      authoritativeSource: "Phase 13C/14 dependency contracts",
    });
    return finish(
      "UNSUPPORTED",
      action,
      executionResult,
      diagnostics,
      checks,
      {
        ...meta,
        serviceDependencyClass: action.metadata.serviceDependencyClass,
        artifactContinuityComplete: false,
      },
      payload,
      allowUnvalidated,
    );
  }

  switch (expectedKind) {
    case "capability_definition":
    case "conversational_action_resolution":
    case "none": {
      checks.push("generation_envelope");
      if (expectedKind === "none") {
        diagnostics.push({
          code: "UNSUPPORTED_VALIDATION",
          severity: "error",
          message: "No output schema for kind none",
          authoritativeSource: "ActionDefinition.outputContract",
        });
        return finish(
          "UNSUPPORTED",
          action,
          executionResult,
          diagnostics,
          checks,
          { ...meta, deepValidation: "not_applicable" },
          payload,
          allowUnvalidated,
        );
      }
      // Identify-only / capability: surface VALID when kind matches; no deep schema
      if (diagnostics.some((d) => d.severity === "error")) {
        return finish(
          "INVALID",
          action,
          executionResult,
          diagnostics,
          checks,
          meta,
          payload,
          allowUnvalidated,
        );
      }
      return finish(
        "VALID",
        action,
        executionResult,
        diagnostics,
        checks,
        { ...meta, deepValidation: "not_applicable" },
        payload,
        allowUnvalidated,
      );
    }

    case "cdf_transition_result":
    case "selection":
    case "approval": {
      const checkId: OutputQACheckId =
        expectedKind === "selection"
          ? "selection_shape"
          : expectedKind === "approval"
            ? "approval_shape"
            : "transition_shape";
      checks.push(checkId);
      const transition = payload.cdfTransition ?? payload.value;
      if (!transition || typeof transition !== "object") {
        diagnostics.push({
          code: "OUTPUT_MISSING",
          severity: "error",
          message: "CDF transition/selection/approval result missing",
          authoritativeSource: "executeCdfAction",
        });
      } else {
        const session = (transition as { session?: { sessionId?: string } })
          .session;
        if (!session?.sessionId) {
          diagnostics.push({
            code: "REQUIRED_FIELD_MISSING",
            severity: "error",
            message: "transition result missing session.sessionId",
            fieldPath: "session.sessionId",
            authoritativeSource: "CdfTransitionResult",
          });
        }
      }
      break;
    }

    case "render_result":
    case "export_result": {
      checks.push("render_shape");
      const file = payload.renderedFile;
      const value = payload.value as
        | { fileId?: string; format?: string }
        | undefined;
      if (!file?.fileId && !value?.fileId) {
        // materialize via SM may return transition without render file
        if (payload.cdfTransition) {
          checks.push("transition_shape");
        } else {
          diagnostics.push({
            code: "OUTPUT_MISSING",
            severity: "error",
            message: "render/export result missing file identity",
            authoritativeSource: "renderArtifact / CdfRenderedFile",
          });
        }
      } else {
        meta.artifactId = file?.artifactId;
        meta.artifactVersion = file?.artifactVersion;
      }
      break;
    }

    case "artifact_version": {
      checks.push("persistence_consistency");
      const fromExec = extractArtifactFromExecutionValue(payload.value);
      const artifact = context.providedArtifact ?? fromExec;
      if (!artifact) {
        diagnostics.push({
          code: "ARTIFACT_NOT_FOUND",
          severity: "error",
          message: "No ArtifactVersion in execution result or QA context",
          authoritativeSource: "cdf/artifacts/repository",
        });
        break;
      }
      const partial = validateProvidedArtifactSchema(artifact, context);
      diagnostics.push(...partial.diagnostics);
      checks.push(...partial.checks);
      Object.assign(meta, partial.metadata);
      break;
    }

    case "generation_result": {
      checks.push("generation_envelope");
      if (!payload.modelRequest && !payload.orchestration) {
        diagnostics.push({
          code: "OUTPUT_MISSING",
          severity: "error",
          message: "generation_result missing CMR / orchestration payload",
          authoritativeSource: "Context Orchestrator / Model Runtime",
        });
      }
      if (
        context.requireStructuredArtifact === true &&
        context.providedArtifact?.data == null
      ) {
        // Detect free-text fallback / structured loss when structured required
        const value = payload.value as { freeTextOnly?: boolean } | undefined;
        if (value?.freeTextOnly === true) {
          checks.push("generation_envelope");
          diagnostics.push({
            code: "FREE_TEXT_FALLBACK",
            severity: "error",
            message:
              "Structured artifact output required but free-text-only result observed",
            authoritativeSource: "ActionDefinition.outputContract",
          });
        } else if (policy.requireArtifactPersistence) {
          diagnostics.push({
            code: "STRUCTURED_OUTPUT_LOSS",
            severity: "error",
            message:
              "Structured ArtifactVersion data missing where persistence required",
            authoritativeSource: "ArtifactVersion",
          });
        }
      }
      if (context.providedArtifact) {
        const partial = validateProvidedArtifactSchema(
          context.providedArtifact,
          context,
        );
        diagnostics.push(...partial.diagnostics);
        checks.push(...partial.checks);
        Object.assign(meta, partial.metadata);
      } else if (
        policy.requireArtifactPersistence === true &&
        !diagnostics.some(
          (d) =>
            d.code === "STRUCTURED_OUTPUT_LOSS" ||
            d.code === "FREE_TEXT_FALLBACK",
        )
      ) {
        diagnostics.push({
          code: "UNSUPPORTED_VALIDATION",
          severity: "error",
          message:
            "Deep artifact persistence QA requires provided ArtifactVersion data",
          authoritativeSource: "OutputQAContext.providedArtifact",
        });
        return finish(
          "UNSUPPORTED",
          action,
          executionResult,
          diagnostics,
          checks,
          meta,
          payload,
          allowUnvalidated,
        );
      }
      break;
    }

    default: {
      diagnostics.push({
        code: "UNSUPPORTED_VALIDATION",
        severity: "error",
        message: `No Output QA adapter for kind ${expectedKind}`,
        authoritativeSource: "ActionDefinition.outputContract",
      });
      return finish(
        "UNSUPPORTED",
        action,
        executionResult,
        diagnostics,
        checks,
        meta,
        payload,
        allowUnvalidated,
      );
    }
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    // Separate UNSUPPORTED-only errors
    const onlyUnsupported = diagnostics.every(
      (d) =>
        d.severity !== "error" || d.code === "UNSUPPORTED_VALIDATION",
    );
    const hasUnsupported = diagnostics.some(
      (d) => d.code === "UNSUPPORTED_VALIDATION" && d.severity === "error",
    );
    const hasOtherErrors = diagnostics.some(
      (d) => d.severity === "error" && d.code !== "UNSUPPORTED_VALIDATION",
    );
    if (hasUnsupported && !hasOtherErrors) {
      return finish(
        "UNSUPPORTED",
        action,
        executionResult,
        diagnostics,
        checks,
        meta,
        payload,
        allowUnvalidated,
      );
    }
    void onlyUnsupported;
    return finish(
      "INVALID",
      action,
      executionResult,
      diagnostics,
      checks,
      meta,
      payload,
      allowUnvalidated,
    );
  }

  return finish(
    "VALID",
    action,
    executionResult,
    diagnostics,
    checks,
    meta,
    payload,
    allowUnvalidated,
  );
}

export function getOutputQAContractVersion(): string {
  return OUTPUT_QA_CONTRACT_VERSION;
}

/**
 * Helper: given QA result, whether required completion may advance.
 * INVALID never advances. UNSUPPORTED only with explicit allow flag.
 */
export function assertOutputQAAllowsAdvancement(
  qa: CanonicalOutputQAResult,
): { ok: true } | { ok: false; reason: string } {
  if (qa.mayAdvance) return { ok: true };
  if (qa.status === "INVALID") {
    return {
      ok: false,
      reason: `Output QA INVALID blocks completion: ${qa.diagnostics.map((d) => d.code).join(",")}`,
    };
  }
  return {
    ok: false,
    reason: "Output QA UNSUPPORTED without allowUnvalidatedContinuation",
  };
}
