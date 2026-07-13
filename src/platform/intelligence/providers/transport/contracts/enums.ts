/**
 * Transport platform enumerations.
 *
 * Purpose: Closed unions shared across the transport framework.
 * Responsibilities: Protocols, session/connection states, error + event kinds.
 * Usage: Referenced by contracts and subsystems.
 * Future Extension: Additive values (MCP, enterprise gateway) without breaking.
 */

export type TransportProtocol =
  | "http"
  | "https"
  | "sdk"
  | "grpc"
  | "websocket"
  | "sse"
  | "local"
  | "mcp"
  | "enterprise_gateway";

export type TransportSessionState =
  | "created"
  | "opening"
  | "open"
  | "executing"
  | "streaming"
  | "closing"
  | "closed"
  | "failed";

export type ConnectionState =
  | "idle"
  | "acquired"
  | "in_use"
  | "released"
  | "closed";

export type TransportHealthState =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "unknown";

export type TransportErrorKind =
  | "connection"
  | "serialization"
  | "deserialization"
  | "protocol"
  | "timeout"
  | "cancelled"
  | "pool_exhausted"
  | "unavailable"
  | "unknown";

export type StreamEventKind = "start" | "chunk" | "heartbeat" | "end" | "error";

export type CompressionAlgorithm = "none" | "gzip" | "deflate" | "br";

export type MiddlewareStage = "request" | "response";

const SESSION_TRANSITIONS: Readonly<
  Record<TransportSessionState, readonly TransportSessionState[]>
> = {
  created: ["opening", "failed", "closed"],
  opening: ["open", "failed", "closed"],
  open: ["executing", "streaming", "closing", "failed"],
  executing: ["streaming", "closing", "failed"],
  streaming: ["closing", "failed"],
  closing: ["closed", "failed"],
  closed: [],
  failed: [],
};

export function canTransitionSession(
  from: TransportSessionState,
  to: TransportSessionState
): boolean {
  if (from === to) {
    return true;
  }
  return SESSION_TRANSITIONS[from].includes(to);
}

export function isTerminalSessionState(state: TransportSessionState): boolean {
  return SESSION_TRANSITIONS[state].length === 0;
}
