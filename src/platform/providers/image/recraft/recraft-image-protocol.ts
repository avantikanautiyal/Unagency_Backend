/**
 * Recraft image generation — verified wire contract.
 * POST /v1/images/generations (OpenAI-compatible shape)
 * Auth: Bearer
 *
 * Reference images: style_reference_urls (data URLs / https) so attached logos
 * and prompt references are applied on the wire — not prompt-only.
 */

import type {
  IVendorImageProtocol,
  VendorImageNormalizedResult,
  VendorImageWirePlan,
} from "../common/vendor-image-protocol";
import {
  extractPrompt,
  extractReferenceImages,
  referenceImageToDataUrl,
} from "../common/vendor-image-protocol";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  attachMediaOutputs,
  mapOpenAIImageDataToOutputs,
} from "../../common/media-output";

export class RecraftImageProtocol implements IVendorImageProtocol {
  readonly vendor = "recraft";

  validateModel(spec: VerifiedImageProviderSpec, wireModelId: string): boolean {
    const lower = wireModelId.toLowerCase();
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      lower.includes("recraft")
    );
  }

  buildGenerateRequest(input: {
    spec: VerifiedImageProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
  }): VendorImageWirePlan {
    const basePrompt = extractPrompt(input.request.payload);
    const refs = extractReferenceImages(input.request.payload ?? {});
    const styleUrls = refs
      .map((ref) => referenceImageToDataUrl(ref))
      .filter((url): url is string => Boolean(url))
      .slice(0, 10);

    const prompt =
      styleUrls.length > 0 &&
      !/\breference\b|\battached\b|\blogo\b|\bbrand\s*mark\b/i.test(basePrompt)
        ? `${basePrompt}\nUse the attached style/reference image(s) faithfully — keep the mark recognizable.`
        : basePrompt;

    const body: Record<string, unknown> = {
      prompt,
      model: input.spec.wireModelId,
      n: 1,
    };
    if (styleUrls.length > 0) {
      body.style_reference_urls = styleUrls;
    }

    return {
      request: {
        method: "POST",
        path: "/v1/images/generations",
        headers: { "Content-Type": "application/json" },
        body,
      },
    };
  }

  normalizeGenerateResponse(input: {
    spec: VerifiedImageProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
  }): VendorImageNormalizedResult {
    const outputs = mapOpenAIImageDataToOutputs(input.body);
    return {
      output: attachMediaOutputs(
        { content: `[${outputs.length} image(s)]`, provider: input.spec.vendor },
        outputs
      ),
      usage: { imagesGenerated: outputs.length },
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    return `Recraft HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
  }
}
