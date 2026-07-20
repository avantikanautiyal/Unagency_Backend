/**
 * Streaming contracts.
 */

import type { TemplateStreamEventKind } from "./enums";
import type { TemplateWirePayload } from "./wire";

export interface TemplateStreamChunk {
  readonly event: TemplateStreamEventKind;
  readonly sequence: number;
  readonly payload?: TemplateWirePayload;
  readonly timestamp: string;
}

export interface TemplateStreamSession {
  readonly sessionId: string;
  readonly requestId: string;
  readonly startedAt: string;
  readonly completed: boolean;
}
