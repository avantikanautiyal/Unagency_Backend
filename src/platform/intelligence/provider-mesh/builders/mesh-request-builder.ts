/**
 * Provider Mesh request builder.
 */

import type { ProviderMeshRequest, ProviderMeshEvent } from "../contracts/inputs";

export class ProviderMeshRequestBuilder {
  private requestId = "mesh_req";
  private events: ProviderMeshEvent[] = [];
  private providerIds?: string[];
  private metadata?: Record<string, unknown>;

  static create(): ProviderMeshRequestBuilder {
    return new ProviderMeshRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withEvents(events: readonly ProviderMeshEvent[]): this {
    this.events = [...events];
    return this;
  }

  addEvent(event: ProviderMeshEvent): this {
    this.events.push(event);
    return this;
  }

  withProviderIds(ids: readonly string[]): this {
    this.providerIds = [...ids];
    return this;
  }

  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this.metadata = { ...metadata };
    return this;
  }

  build(): ProviderMeshRequest {
    return {
      requestId: this.requestId,
      events: this.events,
      providerIds: this.providerIds,
      metadata: this.metadata,
    };
  }
}
