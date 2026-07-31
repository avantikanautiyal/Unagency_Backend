/**
 * Unexpected transport-layer errors → HTTP response.
 * Platform errors are already encoded in ApiResponse by ApiGatewayEngine.
 */

import type { Request, Response } from "express";
import { serializeError } from "../../serialization/serialize";

export function sendTransportError(
  res: Response,
  err: unknown,
  requestId?: string
): void {
  const message = err instanceof Error ? err.message : "internal transport error";
  res.status(500);
  res.setHeader("content-type", "application/json");
  if (requestId) {
    res.setHeader("x-request-id", requestId);
  }
  res.json(
    serializeError("INTERNAL_ERROR", message, {
      layer: "express-platform-adapter",
    })
  );
}

export function logTransportError(req: Request, err: unknown): void {
  const path = req.originalUrl.split("?")[0];
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[enterprise-api-transport] ${req.method} ${path}: ${message}`);
}
