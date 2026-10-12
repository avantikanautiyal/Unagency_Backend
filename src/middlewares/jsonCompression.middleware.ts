/**
 * Gzip for JSON responses.
 *
 * Execution and project payloads run from hundreds of kilobytes to several
 * megabytes of highly repetitive JSON; sent uncompressed they dominate how long
 * a chat takes to open. Only `res.json` bodies are touched — streams, files and
 * server-sent events pass through untouched.
 */
import { NextFunction, Request, Response } from "express";
import { gzip } from "zlib";

/** Below this the gzip header overhead and CPU are not worth it. */
const MIN_BYTES = 1024;

function acceptsGzip(req: Request): boolean {
  const header = req.headers["accept-encoding"];
  const value = Array.isArray(header) ? header.join(",") : header ?? "";
  return /\bgzip\b/i.test(value);
}

export function jsonCompression(req: Request, res: Response, next: NextFunction): void {
  if (!acceptsGzip(req)) return next();
  const sendJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (res.headersSent || res.getHeader("Content-Encoding")) return sendJson(body);
    let text: string | undefined;
    try {
      text = JSON.stringify(body);
    } catch {
      return sendJson(body);
    }
    if (text === undefined || Buffer.byteLength(text) < MIN_BYTES) return sendJson(body);
    gzip(text, { level: 5 }, (err, compressed) => {
      if (err || res.headersSent) {
        if (!res.headersSent) sendJson(body);
        return;
      }
      if (!res.getHeader("Content-Type")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", compressed.length);
      res.end(compressed);
    });
    return res;
  }) as Response["json"];
  next();
}
