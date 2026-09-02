/**
 * OpenAI HTTP transport — lives in the openai leaf only.
 * Uses fetch for live mode; injectable client for tests.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
import type { OpenAIAuthenticationConfig } from "../contracts/openai-contracts";
import { OPENAI_BASE_URL } from "../constants";

export interface OpenAIHttpMultipartFile {
  readonly fieldName: string;
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

export interface OpenAIHttpRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly multipart?: OpenAIHttpMultipartFile;
  readonly stream?: boolean;
  readonly timeoutMs?: number;
  readonly expectBinary?: boolean;
}

export interface OpenAIHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly rawText?: string;
  readonly binary?: Buffer;
  readonly contentType?: string;
  readonly latencyMs: number;
}

export interface IOpenAIHttpClient {
  send(request: OpenAIHttpRequest): Promise<Result<OpenAIHttpResponse>>;
}

export class FetchOpenAIHttpClient implements IOpenAIHttpClient {
  constructor(
    private readonly auth: OpenAIAuthenticationConfig,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: OpenAIHttpRequest): Promise<Result<OpenAIHttpResponse>> {
    if (!this.auth.apiKey?.trim()) {
      return failure(new ValidationError("OpenAI apiKey required for live HTTP"));
    }

    const base = this.auth.baseUrl ?? OPENAI_BASE_URL;
    const url = `${base.replace(/\/$/, "")}${request.path.startsWith("/") ? "" : "/"}${request.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth.apiKey}`,
    };
    if (this.auth.organizationId) headers["OpenAI-Organization"] = this.auth.organizationId;
    if (this.auth.projectId) headers["OpenAI-Project"] = this.auth.projectId;

    let body: BodyInit | undefined;
    if (request.multipart) {
      const form = new FormData();
      const blob = new Blob([request.multipart.data], {
        type: request.multipart.contentType,
      });
      form.append(request.multipart.fieldName, blob, request.multipart.filename);
      if (request.body) {
        for (const [key, value] of Object.entries(request.body)) {
          if (key.startsWith("_")) continue;
          if (value !== undefined && value !== null) {
            form.append(key, String(value));
          }
        }
      }
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = request.body ? JSON.stringify(request.body) : undefined;
    }

    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timeout = request.timeoutMs ?? 120_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const contentType = res.headers.get("content-type") ?? undefined;
      const isBinary =
        request.expectBinary ||
        (contentType &&
          !contentType.includes("application/json") &&
          !contentType.includes("text/"));

      let text = "";
      let binary: Buffer | undefined;
      if (isBinary) {
        const arrayBuffer = await res.arrayBuffer();
        binary = Buffer.from(arrayBuffer);
      } else {
        text = await res.text();
      }

      let parsed: Record<string, unknown> = {};
      if (!isBinary) {
        try {
          parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          parsed = { raw: text };
        }
      } else {
        parsed = {
          operation: request.path.includes("/speech") ? "audio.speech" : undefined,
          _contentType: contentType ?? "application/octet-stream",
          _audioStorageRef: "inline:binary:0",
        };
      }

      const headerMap: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headerMap[k] = v;
      });

      if (!res.ok) {
        return failure(
          new ProviderError(`OpenAI HTTP ${res.status}`, {
            status: res.status,
            body: parsed,
          })
        );
      }

      return success({
        status: res.status,
        headers: headerMap,
        body: parsed,
        rawText: isBinary ? undefined : text,
        binary,
        contentType,
        latencyMs: this.clockMs() - start,
      });
    } catch (err) {
      return failure(
        new ProviderError(err instanceof Error ? err.message : "OpenAI HTTP failed", {
          cause: err,
        })
      );
    }
  }
}
