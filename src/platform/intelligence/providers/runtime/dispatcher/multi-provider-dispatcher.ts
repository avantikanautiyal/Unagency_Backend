import { failure, success, type Result } from "../../../shared/result";
import type { ProviderId } from "../../../shared/identifiers";
import type { CancellationToken } from "../contracts/cancellation";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../contracts/provider-execution-response";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../interfaces/provider-dispatcher";
import type {
  IProviderRuntimeRegistry,
  ExecutableProviderEntry,
} from "../registry/in-memory-provider-runtime-registry";
import { CapabilityError, ProviderError } from "../../../shared/errors";
import type { StreamingChunk } from "../contracts/streaming";

export interface IModelCapabilityResolver {
  supportsModelCapability(
    modelId: string,
    capabilityId: string
  ): Promise<boolean> | boolean;
}

export interface MultiProviderDispatcherOptions {
  readonly registry: IProviderRuntimeRegistry;
  readonly modelCapabilityResolver?: IModelCapabilityResolver;
  /**
   * Fallback used only for the best-effort streaming wrapper when a provider
   * does not expose dispatchStreaming().
   */
  readonly nowIso?: () => string;
}

export class MultiProviderDispatcher implements IProviderDispatcher {
  private readonly nowIso: () => string;

  constructor(private readonly deps: MultiProviderDispatcherOptions) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  supportsStreaming(providerId: ProviderId): boolean {
    const entry = this.deps.registry.resolveAvailable(providerId);
    if (!entry) return false;
    const underlyingProviderId =
      entry.dispatcherSupportsStreamingProviderId ?? providerId;
    return (
      entry.dispatcher.supportsStreaming(underlyingProviderId) &&
      typeof entry.dispatcher.dispatchStreaming === "function"
    );
  }

  async dispatch(
    request: ProviderExecutionRequest,
    token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const entry = this.resolveExecutable(request.providerId);
    if (!entry) {
      return failure(
        new ProviderError("No executable provider for requested providerId", {
          providerId: String(request.providerId),
        })
      );
    }

    const capabilityCheck = this.checkCapability(
      entry,
      request.capabilityId
    );
    if (!capabilityCheck.ok) return capabilityCheck;

    const modelCheck = await this.checkModelCapability(
      request.modelId,
      request.capabilityId
    );
    if (!modelCheck.ok) return modelCheck;

    return entry.dispatcher.dispatch(request, token);
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    const entry = this.resolveExecutable(request.providerId);
    if (!entry) {
      return failure(
        new ProviderError("No executable provider for requested providerId", {
          providerId: String(request.providerId),
        })
      );
    }

    const capabilityCheck = this.checkCapability(
      entry,
      request.capabilityId
    );
    if (!capabilityCheck.ok) return capabilityCheck;

    const modelCheck = await this.checkModelCapability(
      request.modelId,
      request.capabilityId
    );
    if (!modelCheck.ok) return modelCheck;

    if (typeof entry.dispatcher.dispatchStreaming === "function") {
      return entry.dispatcher.dispatchStreaming(request, token, onChunk);
    }

    // Best-effort streaming: run a single non-streaming request and emit one
    // "done" chunk.
    const result = await entry.dispatcher.dispatch(request, token);
    if (result.ok) {
      const chunk: StreamingChunk = {
        sessionId: `sess_${request.requestId}`,
        requestId: request.requestId,
        sequence: 0,
        data: result.value.output,
        done: true,
        receivedAt: this.nowIso(),
      };
      onChunk(chunk);
    }
    return result;
  }

  private resolveExecutable(
    providerId: ProviderId
  ): ExecutableProviderEntry | undefined {
    return this.deps.registry.resolveAvailable(providerId);
  }

  private checkCapability(
    entry: ExecutableProviderEntry,
    capabilityId: ProviderExecutionRequest["capabilityId"]
  ): Result<void> {
    const requested = String(capabilityId);
    if (!entry.capabilities.includes(requested)) {
      return failure(
        new CapabilityError("Provider does not support requested capability", {
          providerId: String(entry.providerId),
          capabilityId: requested,
        })
      );
    }
    return success(undefined);
  }

  private async checkModelCapability(
    modelId: ProviderExecutionRequest["modelId"],
    capabilityId: ProviderExecutionRequest["capabilityId"]
  ): Promise<Result<void>> {
    if (!this.deps.modelCapabilityResolver) {
      // Capability enforcement still validates provider-level capabilities.
      return success(undefined);
    }

    if (!modelId || !modelId.trim()) {
      return failure(
        new CapabilityError("Missing modelId for model capability check")
      );
    }

    const requested = String(capabilityId);
    const ok = await this.deps.modelCapabilityResolver.supportsModelCapability(
      modelId,
      requested
    );

    if (!ok) {
      return failure(
        new CapabilityError("Model does not support requested capability", {
          modelId,
          capabilityId: requested,
        })
      );
    }

    return success(undefined);
  }
}

