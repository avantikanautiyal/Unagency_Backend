/**
 * Pins Integration Runtime dispatch to the OpenAI leaf during production validation.
 * OS Routing may recommend other providers; this milestone validates OpenAI execution only.
 * Lives in production/ — does not modify Intelligence modules.
 */

import { success, type Result } from "../../intelligence/shared/result";
import { asProviderId } from "../../intelligence/shared/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../intelligence/providers/runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../intelligence/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../intelligence/providers/runtime/contracts/provider-execution-response";
import type { ProviderId } from "../../intelligence/shared/identifiers";
import type { OpenAIProviderPlatform } from "../../intelligence/providers/openai/factories/create-openai-provider";
import { OPENAI_PROVIDER_ID } from "../../intelligence/providers/openai/constants";

export class ProductionPinnedOpenAIDispatcher implements IProviderDispatcher {
  constructor(private readonly openai: OpenAIProviderPlatform) {}

  supportsStreaming(_providerId: ProviderId): boolean {
    return this.openai.dispatcher.supportsStreaming(asProviderId(OPENAI_PROVIDER_ID));
  }

  getLastArtifacts() {
    return this.openai.dispatcher.getLastArtifacts();
  }

  private pin(request: ProviderExecutionRequest): ProviderExecutionRequest {
    const resolved = this.openai.resolveModel({
      requireStreaming: Boolean(request.streaming),
      requireReasoning: true,
    });
    const modelId = resolved.ok
      ? resolved.value.selectedModelId
      : this.openai.discovery.getCached()[0]?.id ?? "gpt-4o-mini";

    return {
      ...request,
      providerId: asProviderId(OPENAI_PROVIDER_ID),
      modelId,
      context: {
        ...request.context,
        providerId: asProviderId(OPENAI_PROVIDER_ID),
      },
      metadata: {
        ...(request.metadata ?? {}),
        productionPinnedProvider: OPENAI_PROVIDER_ID,
        productionOriginalProvider: String(request.providerId),
        productionOriginalModel: request.modelId,
      },
    };
  }

  async dispatch(
    request: ProviderExecutionRequest,
    token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    return this.openai.dispatcher.dispatch(this.pin(request), token);
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    if (typeof this.openai.dispatcher.dispatchStreaming === "function") {
      return this.openai.dispatcher.dispatchStreaming(this.pin(request), token, onChunk);
    }
    const result = await this.dispatch(request, token);
    if (result.ok) {
      onChunk({
        sessionId: `sess_${request.requestId}`,
        requestId: request.requestId,
        sequence: 0,
        data: result.value.output,
        done: true,
        receivedAt: new Date().toISOString(),
      });
    }
    return result.ok ? success(result.value) : result;
  }
}
