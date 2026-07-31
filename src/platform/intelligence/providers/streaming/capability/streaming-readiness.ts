/**
 * M9.5O1 — Streaming readiness (credential-free boot safe).
 * Distinguishes discovered / contract-verified / runtime-ready / configured / executable.
 */

import { evaluateTextProviderEnv } from "../../../../production/execution/text-provider-env";
import {
  buildStreamingTruthMatrix,
  isStreamExecutable,
  type StreamingProviderTruth,
} from "./streaming-capability-truth";

export interface StreamingReadinessReport {
  readonly streamingProvidersDiscovered: number;
  readonly streamingProvidersContractVerified: number;
  readonly streamingProvidersRuntimeReady: number;
  readonly streamingProvidersConfigured: number;
  readonly streamingProvidersExecutable: number;
  readonly matrix: readonly StreamingProviderTruth[];
  /** Soft: never blocks boot without credentials. */
  readonly ready: true;
  readonly detail: string;
}

export function evaluateStreamingReadiness(
  env: NodeJS.ProcessEnv = process.env
): StreamingReadinessReport {
  const configured = new Set(
    evaluateTextProviderEnv(env)
      .filter((p) => p.configured || p.enabled)
      .map((p) => p.providerId)
  );

  const matrix = buildStreamingTruthMatrix({ configuredProviderIds: configured });
  const contractVerified = matrix.filter(
    (m) =>
      m.classification === "NATIVE_STREAM_CONTRACT_VERIFIED" ||
      m.classification === "WIRE_COMPATIBLE_WITH_VERIFIED_ADAPTER"
  ).length;
  const runtimeReady = matrix.filter(
    (m) => m.streamingRuntimeImplemented && m.parserImplemented && m.nativeStreamingVerified
  ).length;
  const configuredCount = matrix.filter((m) => m.configured).length;
  const executable = matrix.filter((m) => isStreamExecutable(m)).length;

  return {
    streamingProvidersDiscovered: matrix.length,
    streamingProvidersContractVerified: contractVerified,
    streamingProvidersRuntimeReady: runtimeReady,
    streamingProvidersConfigured: configuredCount,
    streamingProvidersExecutable: executable,
    matrix,
    ready: true,
    detail: `discovered=${matrix.length} verified=${contractVerified} runtimeReady=${runtimeReady} configured=${configuredCount} executable=${executable}`,
  };
}

/**
 * Routing must exclude providers that are catalogue-claimed but not stream-executable.
 */
export function filterStreamExecutableProviderIds(
  candidateProviderIds: readonly string[],
  configuredProviderIds: ReadonlySet<string>
): readonly string[] {
  const matrix = buildStreamingTruthMatrix({ configuredProviderIds });
  const byId = new Map(matrix.map((m) => [m.providerId, m]));
  return candidateProviderIds.filter((id) => {
    const truth = byId.get(id);
    if (!truth) return false;
    return isStreamExecutable(truth);
  });
}
