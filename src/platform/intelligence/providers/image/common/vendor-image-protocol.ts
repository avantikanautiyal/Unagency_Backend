/**
 * Vendor image protocol — maps canonical image.generate to verified wire contracts.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ImageHttpRequest } from "../http/image-http-client";

export interface VendorImageAuthContext {
  readonly apiKey?: string;
}

export interface VendorImageWirePlan {
  readonly request: ImageHttpRequest;
  /** Optional follow-up poll plan (BFL async). */
  readonly pollPathTemplate?: string;
}

export interface VendorImageNormalizedResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly providerRequestId?: string;
}

export interface IVendorImageProtocol {
  readonly vendor: string;
  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean;
  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan;
  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult;
  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string;
}

export function resolveImageWireModelId(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/").slice(-1)[0] ?? modelId : modelId;
}

export function extractPrompt(payload: Readonly<Record<string, unknown>>): string {
  return String(payload.prompt ?? payload.text ?? payload.input ?? "").trim();
}
