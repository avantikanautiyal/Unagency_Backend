/**
 * Primary model failure → intra-leaf same-provider fallback.
 * Sibling fanout providers must never enter the candidate list.
 */

import assert from "node:assert/strict";
import { ProviderError } from "../../../src/platform/core/errors";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import { failure, success, type Result } from "../../../src/platform/core/result";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import {
  buildGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
  GENERATION_FANOUT_PROVIDER_FAMILIES,
} from "../../../src/platform/generation/generation-fanout";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../src/platform/providers/runtime/contracts/provider-execution-response";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import type { CancellationToken } from "../../../src/platform/providers/runtime/contracts/cancellation";

class ScriptedImageDispatcher extends ControllableDispatcher {
  readonly captured: Array<{ providerId: string; modelId: string }> = [];
  private i = 0;

  constructor(
    private readonly script: ReadonlyArray<
      | { kind: "fail"; message: string }
      | { kind: "ok"; url: string }
    >,
  ) {
    super({ mode: "success" });
  }

  override async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
  ): Promise<Result<ProviderExecutionResponse>> {
    const modelId = String(
      (request.payload as { modelId?: string } | undefined)?.modelId ??
        request.modelId ??
        "",
    );
    this.captured.push({
      providerId: String(request.providerId),
      modelId,
    });
    const step = this.script[this.i] ?? this.script[this.script.length - 1]!;
    this.i += 1;
    if (step.kind === "fail") {
      return failure(
        new ProviderError(step.message, { requestId: request.requestId }),
      );
    }
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        content: step.url,
        text: step.url,
        images: [{ url: step.url }],
        finishReason: "stop",
      },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }
}

describe("fanout leaf primary failure → intra-leaf fallback", () => {
  it("Google leaf: primary fail → same-provider flash; never OpenAI/Ideogram", async () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "leaf_fb_google",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    assert.equal(plan.cardinality, 3);
    const google = plan.targets.find((t) => t.providerId === "provider.google")!;
    const leafMeta = buildGenerationFanoutLeafMetadata({ plan, target: google });
    assert.ok(leafMeta.imageFailoverChain.length >= 1);
    assert.equal(
      leafMeta.imageFailoverChain.every(
        (s) => s.providerId === "provider.google",
      ),
      true,
    );

    const dispatcher = new ScriptedImageDispatcher([
      { kind: "fail", message: "Gemini Pro HTTP 429" },
      { kind: "ok", url: "https://example.com/fallback.png" },
    ]);
    const runtime = createProviderRuntime({ dispatcher });
    const engine = createDirectExecutionEngine({ runtime });
    const report = await engine.run({
      requestId: `req_leaf_fb_${Date.now()}`,
      rawPrompt: "Brand imagery for Sunflower",
      organizationId: asOrganizationId("org_leaf_fb"),
      correlationId: `corr_leaf_fb_${Date.now()}`,
      metadata: {
        capabilityId: "image.generate",
        productAction: "direct_passthrough",
        directPassthrough: true,
        ...leafMeta,
        preferredProviderId: google.providerId,
        preferredModelId: google.modelId,
        imageFailoverChain: leafMeta.imageFailoverChain,
        failoverChain: leafMeta.imageFailoverChain,
      },
    });

    assert.equal(report.ok, true);
    if (!report.value.success) {
      assert.fail(
        `expected success after intra-leaf fallback; captured=${JSON.stringify(dispatcher.captured)} err=${report.value.error?.message}`,
      );
    }
    assert.ok(dispatcher.captured.length >= 2);
    for (const c of dispatcher.captured) {
      assert.equal(c.providerId, "provider.google");
    }
    assert.equal(leafMeta.generationFanoutTargetId, google.targetId);
    assert.equal(leafMeta.generationFanoutGroupId, plan.groupId);
  });

  it("OpenAI leaf with sibling models stripped from cross-leaf matrix", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "leaf_fb_openai",
      executableProviderIds: new Set(["provider.openai", "provider.google"]),
    });
    const openai = plan.targets.find((t) => t.providerId === "provider.openai")!;
    const leafMeta = buildGenerationFanoutLeafMetadata({
      plan,
      target: openai,
      matrixFailoverChain: [
        { providerId: "provider.google", modelId: "gemini-3-pro-image" },
      ],
    });
    assert.equal(
      leafMeta.imageFailoverChain.some((s) => s.providerId === "provider.google"),
      false,
    );
    assert.equal(leafMeta.generationFanoutTargetId, openai.targetId);
  });
});
