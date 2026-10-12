/**
 * Logs requests that take long enough for a user to notice.
 *
 * One line per slow request (method, path without query, status, time, size)
 * so the slow endpoints can be read straight from the process logs.
 * Threshold: SLOW_REQUEST_LOG_MS (default 800). Set to 0 to disable.
 */
import { NextFunction, Request, Response } from "express";

function thresholdMs(): number {
  const raw = Number(process.env.SLOW_REQUEST_LOG_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 800;
}

export function slowRequestLog(req: Request, res: Response, next: NextFunction): void {
  const threshold = thresholdMs();
  if (threshold === 0) return next();
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (ms < threshold) return;
    const bytes = Number(res.getHeader("Content-Length")) || undefined;
    console.warn(
      JSON.stringify({
        event: "slow_request",
        method: req.method,
        path: (req.originalUrl || req.url).split("?")[0],
        status: res.statusCode,
        ms: Math.round(ms),
        ...(bytes ? { bytes } : {}),
      })
    );
  });
  next();
}
