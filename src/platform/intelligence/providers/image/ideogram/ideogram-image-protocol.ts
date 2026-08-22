/**
 * Ideogram image generation — verified wire contract.
 * POST /v1/ideogram-v3/generate
 * Auth: Api-Key
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

export class IdeogramImageProtocol implements IVendorImageProtocol {
  readonly vendor = "ideogram";

  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean {
    const lower = wireModelId.toLowerCase();
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      lower.includes("ideogram")
    );
  }

  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan {
    const prompt = extractPrompt(input.request.payload);
    return {
      request: {
        method: "POST",
        path: "/v1/ideogram-v3/generate",
        headers: { "Content-Type": "application/json" },
        body: {
          prompt,
          rendering_speed: "DEFAULT",
        },
      },
    };
  }

  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult {
    const data = input.body.data as Array<Record<string, unknown>> | undefined;
    const outputs: CanonicalMediaOutput[] = Array.isArray(data)
      ? data
          .map((item) => {
            const url = typeof item.url === "string" ? item.url : undefined;
            return url
              ? ({ type: "image", mimeType: "image/png", url } as CanonicalMediaOutput)
              : undefined;
          })
          .filter((x): x is CanonicalMediaOutput => Boolean(x))
      : [];
    return {
      output: attachMediaOutputs(
        { content: `[${outputs.length} image(s)]`, provider: input.spec.vendor },
        outputs
      ),
      usage: { imagesGenerated: outputs.length },
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    return `Ideogram HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
  }
}
