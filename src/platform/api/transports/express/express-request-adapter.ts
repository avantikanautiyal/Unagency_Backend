/**
 * Express → Enterprise API Gateway request translation (transport only).
 */

import type { Request } from "express";
import { randomUUID } from "crypto";
import type { ApiRequest, ApiVersion } from "../../contracts";
import { parseVersionFromPath } from "../../validation/validate-request";

function normalizeHeaders(headers: Request["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

function normalizeQuery(query: Request["query"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.map(String).join(",");
    } else if (typeof value === "object" && value !== null) {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Reconstruct the gateway path from Express request metadata.
 * Supports direct middleware (full path) and mounted routers (baseUrl + path).
 */
export function resolveGatewayPath(req: Request): string {
  const fromOriginal = req.originalUrl.split("?")[0] ?? req.path;
  if (fromOriginal === "/health") {
    return "/v1/health";
  }
  if (fromOriginal === "/ready") {
    return "/v1/ready";
  }
  if (fromOriginal.startsWith("/v1/") || fromOriginal === "/v1/health" || fromOriginal.startsWith("/v2/")) {
    return fromOriginal;
  }
  if (req.baseUrl && (req.baseUrl === "/v1" || req.baseUrl === "/v2")) {
    const suffix = req.path.startsWith("/") ? req.path : `/${req.path}`;
    return `${req.baseUrl}${suffix}`;
  }
  return req.path;
}

export function parseApiVersionFromGatewayPath(path: string): ApiVersion | undefined {
  return parseVersionFromPath(path);
}

export function toApiRequest(req: Request): ApiRequest | undefined {
  const path = resolveGatewayPath(req);
  const version = parseApiVersionFromGatewayPath(path);
  if (!version) {
    return undefined;
  }

  const requestId =
    (req.headers["x-request-id"] as string | undefined)?.trim() ||
    randomUUID();

  const correlationId =
    (req.headers["x-correlation-id"] as string | undefined)?.trim() || requestId;

  return {
    requestId,
    correlationId,
    method: req.method.toUpperCase() as ApiRequest["method"],
    path,
    version,
    headers: normalizeHeaders(req.headers),
    query: normalizeQuery(req.query),
    body: req.body,
  };
}
