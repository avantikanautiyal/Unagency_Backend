/**
 * M9.5O — Stream commit boundary.
 * BEFORE first semantic output: recoverable failover may occur.
 * AFTER: never silently replace provider/model under the user.
 */

import {
  SEMANTIC_STREAM_EVENT_TYPES,
  type ProviderStreamEvent,
  type ProviderStreamEventType,
} from "./provider-stream-event";

export interface StreamCommitState {
  readonly committed: boolean;
  readonly firstOutputAt?: string;
  readonly lastSequence: number;
  readonly charsEmitted: number;
  readonly bytesEmitted: number;
  readonly semanticEventCount: number;
  readonly eventCount: number;
}

export class StreamCommitTracker {
  private _committed = false;
  private _firstOutputAt?: string;
  private _lastSequence = -1;
  private _charsEmitted = 0;
  private _bytesEmitted = 0;
  private _semanticEventCount = 0;
  private _eventCount = 0;

  get state(): StreamCommitState {
    return {
      committed: this._committed,
      firstOutputAt: this._firstOutputAt,
      lastSequence: this._lastSequence,
      charsEmitted: this._charsEmitted,
      bytesEmitted: this._bytesEmitted,
      semanticEventCount: this._semanticEventCount,
      eventCount: this._eventCount,
    };
  }

  get committed(): boolean {
    return this._committed;
  }

  /**
   * Observe an event. Returns true if this event newly commits the stream.
   */
  observe(event: ProviderStreamEvent): boolean {
    this._eventCount += 1;
    if (event.sequence <= this._lastSequence) {
      // Out-of-order / duplicate — still count but do not rewind.
    } else {
      this._lastSequence = event.sequence;
    }

    if (!SEMANTIC_STREAM_EVENT_TYPES.has(event.type)) {
      return false;
    }

    this._semanticEventCount += 1;
    if (typeof event.contentDelta === "string") {
      this._charsEmitted += event.contentDelta.length;
    }
    if (typeof event.reasoningDelta === "string") {
      this._charsEmitted += event.reasoningDelta.length;
    }
    if (event.audio?.byteLength) {
      this._bytesEmitted += event.audio.byteLength;
    }

    if (!this._committed) {
      this._committed = true;
      this._firstOutputAt = event.at;
      return true;
    }
    return false;
  }

  static isSemantic(type: ProviderStreamEventType): boolean {
    return SEMANTIC_STREAM_EVENT_TYPES.has(type);
  }
}

/** Failover / retry eligibility relative to commit. */
export function mayFailoverOrRetry(committed: boolean): boolean {
  return !committed;
}
