/**
 * Resolve the structured completion candidate for CDF canonical ingest.
 *
 * Provider adapters normalize into jobSummary.structuredData / runtime.output.structured.
 * Prefer those over ExecutionResultPayload — the result builder may rewrite shapes
 * (e.g. website recovery) and must not erase structured emission payloads.
 *
 * Contract modality is authoritative:
 * - text / structured / text_choice → structured/text candidate
 * - image / video / hybrid → media is authoritative; text envelopes are diagnostic only
 */

import {
  isCanonicalStructuredPhaseMetadata,
  requiresCanonicalEmissionSchema,
} from "../../cdf/structured-output-contract";
import { CDF_STRUCTURED_PAYLOAD_LOST } from "../../cdf/structured-execution-result";
import { isDocumentExportProjection } from "./document-export-materializer";
import { resolveCdfPhaseExecutionContract } from "../../cdf/canonical";
import type { CdfPhaseExecutionContract } from "../../cdf/canonical";

export type StructuredCandidateSource =
  | "job_summary.structuredEmissionData"
  | "job_summary.structuredData"
  | "runtime.structured"
  | "runtime.structuredOutput"
  | "runtime.data"
  | "execution_result.structured"
  | "execution_result.text_json"
  | "execution_result.text_envelope"
  | "missing_structured_for_emission"
  | "media_required_for_contract"
  | "none";

export type StructuredCompletionCandidateResolution = {
  readonly candidate: unknown;
  readonly source: StructuredCandidateSource;
  readonly structuredPresent: boolean;
  readonly structuredKeyCount: number;
  readonly structuredKeys: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function structuredKeysMeta(value: unknown): {
  structuredPresent: boolean;
  structuredKeyCount: number;
  structuredKeys: readonly string[];
} {
  if (!isRecord(value)) {
    return {
      structuredPresent: value != null,
      structuredKeyCount: 0,
      structuredKeys: [],
    };
  }
  const keys = Object.keys(value).slice(0, 24);
  return {
    structuredPresent: true,
    structuredKeyCount: keys.length,
    structuredKeys: keys,
  };
}

/**
 * True when candidate is only a diagnostic `{ text: "..." }` envelope —
 * never authoritative for image/video/hybrid canonical contracts.
 */
export function isDiagnosticTextEnvelope(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "text") return false;
  return typeof value.text === "string";
}

function resolveContractFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CdfPhaseExecutionContract | undefined {
  if (!metadata) return undefined;
  return resolveCdfPhaseExecutionContract({
    serviceId:
      typeof metadata.cdfServiceId === "string"
        ? metadata.cdfServiceId
        : typeof metadata.serviceId === "string"
          ? metadata.serviceId
          : typeof metadata.service === "string"
            ? metadata.service
            : undefined,
    phaseId:
      typeof metadata.cdfPhaseId === "string" ? metadata.cdfPhaseId : undefined,
  });
}

/**
 * Media-first modalities: provider text accompanying the result is diagnostic,
 * not the canonical completion candidate.
 */
export function contractRequiresMediaCompletionCandidate(
  contract:
    | Pick<CdfPhaseExecutionContract, "executionStrategy" | "generationModality">
    | null
    | undefined,
): boolean {
  if (!contract) return false;
  if (contract.executionStrategy !== "canonical") return false;
  return (
    contract.generationModality === "image" ||
    contract.generationModality === "video" ||
    contract.generationModality === "hybrid"
  );
}

function tryParseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    // ignore
  }
  return undefined;
}

function metadataRequiresStructuredEmission(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;
  if (isCanonicalStructuredPhaseMetadata(metadata)) return true;
  const contract = resolveContractFromMetadata(metadata);
  return contract != null && requiresCanonicalEmissionSchema(contract);
}

/**
 * Authoritative structured candidate for applyCdfCanonicalCompletionIngest.
 * Never reconstructs from UI. Never invents routes from prose for emission phases.
 * Never promotes a text envelope as the candidate for image/video/hybrid contracts.
 */
export function resolveStructuredCompletionCandidate(input: {
  readonly result?: {
    readonly kind: string;
    readonly data?: unknown;
    readonly text?: string;
  };
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): StructuredCompletionCandidateResolution {
  const emissionRequired = metadataRequiresStructuredEmission(input.metadata);
  const phaseContract = resolveContractFromMetadata(input.metadata);
  const mediaRequired = contractRequiresMediaCompletionCandidate(phaseContract);

  const fromEmission = input.jobSummary?.structuredEmissionData;
  if (fromEmission != null && emissionRequired) {
    if (!(mediaRequired && isDiagnosticTextEnvelope(fromEmission))) {
      return {
        candidate: fromEmission,
        source: "job_summary.structuredEmissionData",
        ...structuredKeysMeta(fromEmission),
      };
    }
  }

  const fromSummary = input.jobSummary?.structuredData;
  const summaryIsExportProjection =
    fromSummary != null && isDocumentExportProjection(fromSummary);
  if (
    fromSummary != null &&
    !(emissionRequired && summaryIsExportProjection)
  ) {
    // Structured payloads can accompany media phases; prefer them when present.
    // Pure text envelopes must not win for media contracts (handled below).
    if (!(mediaRequired && isDiagnosticTextEnvelope(fromSummary))) {
      return {
        candidate: fromSummary,
        source: "job_summary.structuredData",
        ...structuredKeysMeta(fromSummary),
      };
    }
  }

  const fromRuntimeStructured = input.runtimeOutput?.structured;
  if (fromRuntimeStructured != null) {
    if (!(mediaRequired && isDiagnosticTextEnvelope(fromRuntimeStructured))) {
      return {
        candidate: fromRuntimeStructured,
        source: "runtime.structured",
        ...structuredKeysMeta(fromRuntimeStructured),
      };
    }
  }

  const fromRuntimeSo = input.runtimeOutput?.structuredOutput;
  if (fromRuntimeSo != null) {
    if (!(mediaRequired && isDiagnosticTextEnvelope(fromRuntimeSo))) {
      return {
        candidate: fromRuntimeSo,
        source: "runtime.structuredOutput",
        ...structuredKeysMeta(fromRuntimeSo),
      };
    }
  }

  if (
    input.runtimeOutput?.data != null &&
    typeof input.runtimeOutput.data === "object"
  ) {
    if (!(mediaRequired && isDiagnosticTextEnvelope(input.runtimeOutput.data))) {
      return {
        candidate: input.runtimeOutput.data,
        source: "runtime.data",
        ...structuredKeysMeta(input.runtimeOutput.data),
      };
    }
  }

  if (input.result?.kind === "structured" && input.result.data != null) {
    if (!(mediaRequired && isDiagnosticTextEnvelope(input.result.data))) {
      return {
        candidate: input.result.data,
        source: "execution_result.structured",
        ...structuredKeysMeta(input.result.data),
      };
    }
  }

  const text =
    input.result?.kind === "text" && typeof input.result.text === "string"
      ? input.result.text
      : typeof input.jobSummary?.resultText === "string"
        ? input.jobSummary.resultText
        : undefined;

  const parsed = tryParseJsonObject(text);
  if (parsed != null) {
    if (!(mediaRequired && isDiagnosticTextEnvelope(parsed))) {
      return {
        candidate: parsed,
        source: "execution_result.text_json",
        ...structuredKeysMeta(parsed),
      };
    }
  }

  // Canonical emission phases must not fall back to a prose { text } envelope —
  // social/presentation normalizers reject that and must fail closed instead.
  if (emissionRequired) {
    return {
      candidate: null,
      source: "missing_structured_for_emission",
      structuredPresent: false,
      structuredKeyCount: 0,
      structuredKeys: [],
    };
  }

  // Image/video/hybrid: text is diagnostic only. Defer to media bridge in ingest.
  if (mediaRequired) {
    return {
      candidate: null,
      source: "media_required_for_contract",
      structuredPresent: false,
      structuredKeyCount: 0,
      structuredKeys: [],
    };
  }

  if (text?.trim()) {
    const envelope = { text };
    return {
      candidate: envelope,
      source: "execution_result.text_envelope",
      ...structuredKeysMeta(envelope),
    };
  }

  return {
    candidate: undefined,
    source: "none",
    structuredPresent: false,
    structuredKeyCount: 0,
    structuredKeys: [],
  };
}

/** Non-sensitive pipeline diagnostic (no prompts / full payloads). */
export function logStructuredCompletionPipeline(
  event: string,
  fields: {
    readonly executionId?: string;
    readonly jobId?: string;
    readonly cdfSessionId?: string;
    readonly cdfPhaseId?: string;
    readonly outputContractName?: string;
    readonly artifactKey?: string;
    readonly generationModality?: string;
    readonly candidateSource?: StructuredCandidateSource;
    readonly structuredPresent?: boolean;
    readonly structuredKeyCount?: number;
    readonly structuredKeys?: readonly string[];
    readonly runtimeStructuredPresent?: boolean;
    readonly structuredPayloadHash?: string;
    readonly resultKind?: string;
    readonly resultKeys?: readonly string[];
    readonly ingestResult?: string;
    readonly artifactId?: string;
    readonly artifactVersion?: number;
    readonly reason?: string;
    readonly path?: string;
  },
): void {
  try {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "execution.structured_completion",
        event,
        ...fields,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore
  }
}

export function detectStructuredPayloadLoss(input: {
  readonly executionId?: string;
  readonly jobId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly priorStructuredPresent?: boolean;
  readonly priorStructuredHash?: string;
  readonly sourceBoundary: string;
  readonly hydrationBoundary: string;
}): {
  readonly lost: boolean;
  readonly code?: typeof CDF_STRUCTURED_PAYLOAD_LOST;
  readonly detail?: Record<string, unknown>;
} {
  if (!metadataRequiresStructuredEmission(input.metadata)) {
    return { lost: false };
  }
  const summaryPresent =
    input.jobSummary?.structuredEmissionData != null ||
    input.jobSummary?.structuredData != null;
  const runtimePresent =
    input.runtimeOutput?.structured != null ||
    input.runtimeOutput?.structuredOutput != null;
  const lastHash =
    typeof input.jobSummary?.structuredPayloadHash === "string"
      ? input.jobSummary.structuredPayloadHash
      : input.priorStructuredHash;
  const hadStructured =
    input.priorStructuredPresent === true || Boolean(lastHash);
  if (hadStructured && !summaryPresent && !runtimePresent) {
    return {
      lost: true,
      code: CDF_STRUCTURED_PAYLOAD_LOST,
      detail: {
        reason: CDF_STRUCTURED_PAYLOAD_LOST,
        executionId: input.executionId,
        jobId: input.jobId,
        structuredContractName:
          typeof input.jobSummary?.structuredContractName === "string"
            ? input.jobSummary.structuredContractName
            : typeof input.metadata?.cdfAuthorityStructuredOutputName ===
                "string"
              ? input.metadata.cdfAuthorityStructuredOutputName
              : undefined,
        structuredSchemaVersion:
          typeof input.jobSummary?.structuredSchemaVersion === "string"
            ? input.jobSummary.structuredSchemaVersion
            : "1",
        sourceBoundary: input.sourceBoundary,
        lastKnownStructuredHash: lastHash,
        hydrationBoundary: input.hydrationBoundary,
      },
    };
  }
  return { lost: false };
}
