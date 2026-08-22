/**
 * Enterprise API Gateway → Express response translation (transport only).
 * M9.5O: supports text/event-stream when ApiResponse.sse is set.
 * M10.8: client disconnect cancels the live stream via sse.cancel.
 */

import type { Response } from "express";
import type { ApiResponse } from "../../contracts";
import { formatSseFrame } from "../../../intelligence/providers/streaming/transport/sse-writer";

export function sendApiResponse(res: Response, apiResponse: ApiResponse): void {
  for (const [key, value] of Object.entries(apiResponse.headers)) {
    if (value !== undefined) {
      res.setHeader(key, value);
    }
  }

  res.status(apiResponse.status);

  if (apiResponse.status === 204) {
    res.end();
    return;
  }

  if (apiResponse.sse) {
    void writeSseResponse(res, apiResponse);
    return;
  }

  if (apiResponse.binary) {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", apiResponse.binary.contentType);
    }
    res.setHeader("Content-Length", String(apiResponse.binary.bytes.byteLength));
    res.setHeader("Cache-Control", "private, max-age=60");
    res.end(apiResponse.binary.bytes);
    return;
  }

  if (apiResponse.body === undefined || apiResponse.body === null) {
    res.end();
    return;
  }

  res.json(apiResponse.body);
}

async function writeSseResponse(
  res: Response,
  apiResponse: ApiResponse
): Promise<void> {
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "text/event-stream");
  }
  if (!res.getHeader("Cache-Control")) {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (!res.getHeader("Connection")) {
    res.setHeader("Connection", "keep-alive");
  }

  const onClose = () => {
    apiResponse.sse?.cancel?.("client_disconnected");
  };
  if (typeof res.on === "function") {
    res.on("close", onClose);
  }

  const writeFrame = (frame: { event: string; id: string; data: string }) => {
    const chunk = formatSseFrame(frame);
    const ok = res.write(chunk);
    return ok !== false;
  };

  try {
    for (const frame of apiResponse.sse!.frames) {
      if (res.writableEnded || res.destroyed) return;
      const ok = writeFrame(frame);
      if (!ok) {
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }

    if (apiResponse.sse!.frameIterable) {
      for await (const frame of apiResponse.sse!.frameIterable) {
        if (res.writableEnded || res.destroyed) return;
        const ok = writeFrame(frame);
        if (!ok) {
          await new Promise<void>((resolve) => res.once("drain", resolve));
        }
      }
    }
  } finally {
    if (typeof res.off === "function") {
      res.off("close", onClose);
    } else if (typeof res.removeListener === "function") {
      res.removeListener("close", onClose);
    }
    if (!res.writableEnded) res.end();
  }
}
