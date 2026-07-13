/**
 * Specialized abstract adapters.
 *
 * Purpose: Modality-specialized reusable base classes future providers extend.
 * Responsibilities: Fix the AdapterCategory; add modality-specific helpers.
 * Usage: A concrete provider (M4.5) extends the matching base and implements
 *   translateRequest only.
 * Future Extension: New modality bases (e.g. video).
 */

import { failure, type Result } from "../../../shared/result";
import type { ProviderWirePayload } from "../contracts/adapter-io";
import type { AdapterCategory } from "../contracts/enums";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type {
  ProviderStreamChunk,
  ProviderStreamSession,
} from "../contracts/lifecycle-streaming";
import { AdapterError } from "../errors/adapter-errors";
import type { IStreamingAdapter } from "../interfaces/lifecycle-streaming";
import { DefaultStreamingAdapter } from "../streaming/default-streaming-adapter";
import { AbstractProviderAdapter } from "./abstract-provider-adapter";

export abstract class AbstractTextProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "text";
}

export abstract class AbstractReasoningProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "reasoning";
}

export abstract class AbstractVisionProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "vision";
}

export abstract class AbstractImageProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "image";
}

export abstract class AbstractAudioProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "audio";
}

export abstract class AbstractEmbeddingProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "embedding";
}

export abstract class AbstractMultimodalProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "multimodal";
}

/**
 * Streaming-capable base: exposes canonical stream lifecycle helpers.
 * Concrete adapters implement translateRequest and (optionally) override the
 * chunk mapping by supplying a custom IStreamingAdapter.
 */
export abstract class AbstractStreamingProviderAdapter extends AbstractProviderAdapter {
  readonly category: AdapterCategory = "streaming";

  protected readonly streamingAdapter: IStreamingAdapter =
    new DefaultStreamingAdapter(this.nowIso);

  openStream(requestId: string): Result<ProviderStreamSession> {
    if (!this.manifest.streaming.supported) {
      return failure(
        new AdapterError("provider does not support streaming", {
          adapterId: this.metadata.adapterId,
        })
      );
    }
    return this.streamingAdapter.openStream(requestId, this.metadata.adapterId as ProviderAdapterId);
  }

  normalizeChunk(
    raw: ProviderWirePayload,
    session: ProviderStreamSession
  ): Result<ProviderStreamChunk> {
    return this.streamingAdapter.normalizeChunk(raw, session);
  }

  heartbeat(session: ProviderStreamSession): Result<ProviderStreamChunk> {
    return this.streamingAdapter.heartbeat(session);
  }

  closeStream(session: ProviderStreamSession): Result<ProviderStreamSession> {
    return this.streamingAdapter.closeStream(session);
  }
}
