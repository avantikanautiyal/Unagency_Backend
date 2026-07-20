/**
 * Abstract streaming engine.
 */

import type { Result } from "../../../shared/result";
import { success } from "../../../shared/result";
import type { TemplateCanonicalRequest } from "../contracts/request-response";
import type { TemplateStreamChunk, TemplateStreamSession } from "../contracts/streaming";
import type { IProviderStreamingEngine } from "../interfaces/provider-template";

export abstract class AbstractStreamingEngine implements IProviderStreamingEngine {
  private readonly sessions = new Map<string, TemplateStreamChunk[]>();

  openSession(request: TemplateCanonicalRequest): Result<TemplateStreamSession> {
    const session: TemplateStreamSession = {
      sessionId: `stream_${request.requestId}`,
      requestId: String(request.requestId),
      startedAt: new Date().toISOString(),
      completed: false,
    };
    this.sessions.set(session.sessionId, []);
    return success(session);
  }

  processChunk(sessionId: string, chunk: TemplateStreamChunk): Result<void> {
    const chunks = this.sessions.get(sessionId);
    if (!chunks) return { ok: false, error: new Error("session not found") as never };
    chunks.push(chunk);
    return success(undefined);
  }

  closeSession(sessionId: string): Result<readonly TemplateStreamChunk[]> {
    const chunks = this.sessions.get(sessionId);
    if (!chunks) return { ok: false, error: new Error("session not found") as never };
    this.sessions.delete(sessionId);
    return success(chunks);
  }
}
