/**
 * Black Forest Labs FLUX — verified wire contract.
 * POST /v1/{endpoint} → { id }; poll GET /v1/get_result?id=
 * Auth: x-key
 */

import type {
  IVendorImageProtocol,
  VendorImageNormalizedResult,
  VendorImageWirePlan,
} from "../common/vendor-image-protocol";
import { extractPrompt } from "../common/vendor-image-protocol";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  attachMediaOutputs,
  type CanonicalMediaOutput,
} from "../../common/media-output";

const ENDPOINT_BY_MODEL: Record<string, string> = {
  "flux-kontext-pro": "flux-kontext-pro",
  "flux-pro-1.1": "flux-pro-1.1",
  "flux-pro-1-1": "flux-pro-1.1",
};

export class BflImageProtocol implements IVendorImageProtocol {
  readonly vendor = "blackforestlabs";

  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean {
    const lower = wireModelId.toLowerCase();
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      lower.includes("flux") ||
      Boolean(ENDPOINT_BY_MODEL[wireModelId])
    );
  }

  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan {
    const prompt = extractPrompt(input.request.payload);
    const endpoint =
      ENDPOINT_BY_MODEL[input.wireModelId] ??
      ENDPOINT_BY_MODEL[input.spec.wireModelId] ??
      input.spec.wireModelId;
    return {
      request: {
        method: "POST",
        path: `/v1/${endpoint}`,
        headers: { "Content-Type": "application/json" },
        body: {
          prompt,
          ...(typeof input.request.payload.aspect_ratio === "string"
            ? { aspect_ratio: input.request.payload.aspect_ratio }
            : {}),
        },
      },
      pollPathTemplate: "/v1/get_result?id={id}",
    };
  }

  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult {
    const result = input.body.result as Record<string, unknown> | undefined;
    const url =
      typeof result?.sample === "string"
        ? result.sample
        : typeof input.body.sample === "string"
          ? input.body.sample
          : undefined;
    const outputs: CanonicalMediaOutput[] = url
      ? [{ type: "image", mimeType: "image/jpeg", url }]
      : [];
    return {
      output: attachMediaOutputs(
        { content: outputs.length ? "[1 image(s)]" : "[image pending]", provider: input.spec.vendor },
        outputs
      ),
      usage: { imagesGenerated: outputs.length },
      providerRequestId:
        typeof input.body.id === "string" ? input.body.id : undefined,
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    return `BFL HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
  }
}
