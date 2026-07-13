/**
 * Default SDK streaming engine.
 *
 * Purpose: Canonicalize streaming into SdkStreamingChunk events.
 * Responsibilities: chunk/partial/complete/error normalization.
 * Usage: Injected where streaming SDK responses are processed.
 * Future Extension: Backpressure. No networking.
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { SdkExecutionContext } from "../contracts/context";
import type { SdkStreamingChunk } from "../contracts/health-result";
import type { ISdkStreamingEngine } from "../interfaces/engines";

export class DefaultSdkStreamingEngine implements ISdkStreamingEngine {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  normalizeChunk(
    raw: ProviderWirePayload,
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk> {
    const source = raw as Record<string, unknown>;
    const done = Boolean(source.done ?? source.finished ?? false);
    const data =
      (source.delta as Record<string, unknown> | undefined) ??
      (source.data as Record<string, unknown> | undefined) ??
      (source.content !== undefined ? { content: source.content } : {});
    return success({
      executionId: context.executionId,
      requestId: context.requestId,
      sequence,
      kind: done ? "complete" : "chunk",
      data,
      done,
      receivedAt: this.nowIso(),
    });
  }

  partial(
    raw: ProviderWirePayload,
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk> {
    const normalized = this.normalizeChunk(raw, context, sequence);
    if (!normalized.ok) {
      return normalized;
    }
    return success({ ...normalized.value, kind: "partial" });
  }

  complete(
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk> {
    return success({
      executionId: context.executionId,
      requestId: context.requestId,
      sequence,
      kind: "complete",
      data: {},
      done: true,
      receivedAt: this.nowIso(),
    });
  }

  error(
    message: string,
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk> {
    return success({
      executionId: context.executionId,
      requestId: context.requestId,
      sequence,
      kind: "error",
      data: { message },
      done: true,
      receivedAt: this.nowIso(),
    });
  }
}
