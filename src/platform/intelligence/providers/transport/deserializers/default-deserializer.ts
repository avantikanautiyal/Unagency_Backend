/**
 * Default transport deserializer.
 *
 * Purpose: TransportResponse → CanonicalProviderResponse.
 * Responsibilities: Normalize protocol body into an opaque canonical payload.
 * Usage: Injected into the pipeline (which finalizes statistics).
 * Future Extension: Streaming aggregate deserialization.
 */

import { success, type Result } from "../../../shared/result";
import type {
  CanonicalProviderRequest,
  CanonicalProviderResponse,
} from "../contracts/canonical";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { TransportResponse } from "../contracts/transport-io";
import type { ITransportDeserializer } from "../interfaces/serde";

function toPayload(body: string | Readonly<Record<string, unknown>>): ProviderWirePayload {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as ProviderWirePayload;
      }
    } catch {
      // not JSON — wrap raw
    }
    return { raw: body };
  }
  return body;
}

export class DefaultTransportDeserializer implements ITransportDeserializer {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  deserialize(
    response: TransportResponse,
    request: CanonicalProviderRequest
  ): Result<CanonicalProviderResponse> {
    const success4xx = response.statusHint === undefined || response.statusHint < 400;
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      protocol: request.protocol,
      success: success4xx,
      payload: toPayload(response.body),
      headers: response.headers,
      statusHint: response.statusHint,
      streamed: response.streamed,
      // Baseline statistics; the pipeline replaces these with measured values.
      statistics: { protocol: request.protocol, attempts: 1, retries: 0 },
      completedAt: this.nowIso(),
    });
  }
}
