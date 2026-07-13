/**
 * Protocol catalog.
 *
 * Purpose: Declarative capabilities per transport protocol.
 * Responsibilities: Map a protocol to its default TransportCapability.
 * Usage: Consumed by clients, diagnostics, and the engine.
 * Future Extension: MCP + enterprise gateway capabilities.
 */

import type { TransportProtocol } from "../contracts/enums";
import type { TransportCapability } from "../contracts/health-result";

const CATALOG: Readonly<Record<TransportProtocol, TransportCapability>> = {
  http: {
    protocol: "http",
    streaming: false,
    bidirectional: false,
    keepAlive: true,
    multiplexing: false,
    compression: ["none", "gzip", "deflate", "br"],
  },
  https: {
    protocol: "https",
    streaming: false,
    bidirectional: false,
    keepAlive: true,
    multiplexing: false,
    compression: ["none", "gzip", "deflate", "br"],
  },
  sdk: {
    protocol: "sdk",
    streaming: true,
    bidirectional: false,
    keepAlive: true,
    multiplexing: false,
    compression: ["none"],
  },
  grpc: {
    protocol: "grpc",
    streaming: true,
    bidirectional: true,
    keepAlive: true,
    multiplexing: true,
    compression: ["none", "gzip"],
  },
  websocket: {
    protocol: "websocket",
    streaming: true,
    bidirectional: true,
    keepAlive: true,
    multiplexing: false,
    compression: ["none"],
  },
  sse: {
    protocol: "sse",
    streaming: true,
    bidirectional: false,
    keepAlive: true,
    multiplexing: false,
    compression: ["none"],
  },
  local: {
    protocol: "local",
    streaming: true,
    bidirectional: false,
    keepAlive: false,
    multiplexing: false,
    compression: ["none"],
  },
  mcp: {
    protocol: "mcp",
    streaming: true,
    bidirectional: true,
    keepAlive: true,
    multiplexing: true,
    compression: ["none"],
  },
  enterprise_gateway: {
    protocol: "enterprise_gateway",
    streaming: true,
    bidirectional: false,
    keepAlive: true,
    multiplexing: true,
    compression: ["none", "gzip"],
  },
};

export function capabilityForProtocol(
  protocol: TransportProtocol
): TransportCapability {
  return CATALOG[protocol];
}

export function allProtocols(): readonly TransportProtocol[] {
  return Object.keys(CATALOG) as TransportProtocol[];
}
