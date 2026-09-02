/**
 * Provider runtime testing utilities.
 *
 * Purpose: Deterministic fixtures and a controllable dispatcher for tests.
 * Responsibilities: Build requests; simulate dispatch outcomes without SDKs.
 * Usage: Imported by unit tests only.
 * Future Extension: Fault-injection scenarios for adapter conformance tests.
 *
 * The controllable dispatcher performs NO network or SDK calls.
 */

import { ProviderError } from "../../../core/errors";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../core/identifiers";
import { failure, success } from "../../../core/result";
import type { Result } from "../../../core/result";
import type { CancellationToken } from "../contracts/cancellation";
import type {
  ProviderExecutionContext,
  ProviderExecutionRequest,
} from "../contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../contracts/provider-execution-response";
import type { RetryPolicy } from "../contracts/retry-policy";
import type { StreamingChunk } from "../contracts/streaming";
import type { TimeoutPolicy } from "../contracts/timeout-policy";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../interfaces/provider-dispatcher";

export type DispatcherMode = "success" | "fail" | "hang";

export interface ControllableDispatcherOptions {
  readonly mode?: DispatcherMode;
  readonly streamingSupported?: boolean;
  /** Fail this many attempts before succeeding (transient failures). */
  readonly failuresBeforeSuccess?: number;
  readonly streamingChunks?: number;
  readonly nowIso?: () => string;
}

export class ControllableDispatcher implements IProviderDispatcher {
  /** Phase 0 marker — detectable by production composition assertions. */
  readonly __unagencySimulatedDispatcher = true as const;
  mode: DispatcherMode;
  streamingSupported: boolean;
  failuresBeforeSuccess: number;
  private readonly streamingChunks: number;
  private readonly nowIso: () => string;
  private _attempts = 0;
  private readonly pending: Array<
    (result: Result<ProviderExecutionResponse>) => void
  > = [];

  constructor(options: ControllableDispatcherOptions = {}) {
    this.mode = options.mode ?? "success";
    this.streamingSupported = options.streamingSupported ?? true;
    this.failuresBeforeSuccess = options.failuresBeforeSuccess ?? 0;
    this.streamingChunks = Math.max(1, options.streamingChunks ?? 2);
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  get attempts(): number {
    return this._attempts;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    this._attempts += 1;

    if (this.mode === "hang") {
      return new Promise((resolve) => {
        this.pending.push(resolve);
      });
    }

    if (this.mode === "fail") {
      return failure(new ProviderError("dispatch failed", { requestId: request.requestId }));
    }

    if (this._attempts <= this.failuresBeforeSuccess) {
      return failure(
        new ProviderError("transient dispatch failure", {
          attempt: this._attempts,
        })
      );
    }

    return success(this.response(request, false));
  }

  supportsStreaming(): boolean {
    return this.streamingSupported;
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    this._attempts += 1;

    if (this.mode === "hang") {
      return new Promise((resolve) => {
        this.pending.push(resolve);
      });
    }

    if (this.mode === "fail") {
      return failure(new ProviderError("stream failed"));
    }

    for (let i = 0; i < this.streamingChunks; i += 1) {
      if (token.cancelled) {
        break;
      }
      const chunk: StreamingChunk = {
        sessionId: request.requestId,
        requestId: request.requestId,
        sequence: i,
        data: { index: i },
        done: i === this.streamingChunks - 1,
        receivedAt: this.nowIso(),
      };
      onChunk(chunk);
    }
    return success(this.response(request, true));
  }

  /** Resolve any hung dispatches (test cleanup). */
  settle(result?: Result<ProviderExecutionResponse>): void {
    const value = result;
    for (const resolve of this.pending) {
      resolve(
        value ??
          success({
            requestId: "hung",
            providerId: asProviderId("provider-a"),
            output: {},
            streamed: false,
            finishedAt: this.nowIso(),
          })
      );
    }
    this.pending.length = 0;
  }

  private response(
    request: ProviderExecutionRequest,
    streamed: boolean
  ): ProviderExecutionResponse {
    const toolsPayload = request.payload?.tools;
    const hasTools =
      Array.isArray(toolsPayload) && toolsPayload.length > 0;

    // M10.7 — when ToolContinuationOrchestrator attaches tools, emit a
    // deterministic tool_call (then final text/json on the next round).
    if (hasTools) {
      const messages = Array.isArray(request.payload?.messages)
        ? (request.payload!.messages as readonly Record<string, unknown>[])
        : [];
      const hasToolResult = messages.some((m) => m.role === "tool");
      if (!hasToolResult) {
        const call = simulatedToolCall(toolsPayload as readonly Record<string, unknown>[]);
        return {
          requestId: request.requestId,
          providerId: request.providerId,
          output: {
            content: null,
            tool_calls: [call],
            finishReason: "tool_call",
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          providerRequestId: `ctrl_${request.requestId}`,
          streamed,
          finishedAt: this.nowIso(),
        };
      }
      const structured = simulatedStructuredContent(request);
      if (structured) {
        return {
          requestId: request.requestId,
          providerId: request.providerId,
          output: {
            content: structured,
            text: structured,
            message: structured,
            finishReason: "stop",
          },
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          providerRequestId: `ctrl_${request.requestId}`,
          streamed,
          finishedAt: this.nowIso(),
        };
      }
    }

    const structuredContent = simulatedStructuredContent(request);
    if (structuredContent) {
      return {
        requestId: request.requestId,
        providerId: request.providerId,
        output: {
          content: structuredContent,
          text: structuredContent,
          message: structuredContent,
          finishReason: "stop",
        },
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        providerRequestId: `ctrl_${request.requestId}`,
        streamed,
        finishedAt: this.nowIso(),
      };
    }

    const content = simulatedProviderContent(request);
    return {
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        ok: true,
        capabilityId: String(request.capabilityId),
        content,
        text: content,
        message: content,
      },
      usage: { tokens: Math.max(1, Math.ceil(content.length / 4)) },
      providerRequestId: `ctrl_${request.requestId}`,
      streamed,
      finishedAt: this.nowIso(),
    };
  }
}

/** Pick a write-class tool when present; otherwise first tool. */
function simulatedToolCall(
  tools: readonly Record<string, unknown>[]
): Record<string, unknown> {
  const names = tools.map((t) => {
    const fn = (t.function as Record<string, unknown> | undefined) ?? {};
    return String(fn.name ?? t.name ?? "");
  });
  const preferred =
    names.find((n) => n === "update_test_record") ??
    names.find((n) => n.length > 0) ??
    "update_test_record";
  const args =
    preferred === "update_test_record"
      ? { recordId: "draft_1", status: "draft" }
      : preferred === "lookup_campaign"
        ? { campaignId: "camp_demo" }
        : preferred === "calculate_metric"
          ? { metric: "reach", value: 42 }
          : {};
  return {
    id: `call_sim_${preferred}`,
    type: "function",
    function: {
      name: preferred,
      arguments: JSON.stringify(args),
    },
  };
}

/** Deterministic presentation fixtures for controllable dispatch (no network). */
export function simulatedPresentationRouteConceptsJson(): string {
  return JSON.stringify({
    concepts: [
      {
        title: "Heritage",
        description: "Warm brand story for DiVastra ethnic wear",
        narrativeAngle: "Craft and colour heritage",
      },
      {
        title: "Modern",
        description: "Digital-first growth pitch for DiVastra",
        narrativeAngle: "Scale and omnichannel",
      },
      {
        title: "Bold",
        description: "High-contrast launch narrative",
        narrativeAngle: "Category leadership",
      },
    ],
  });
}

export function simulatedPresentationRoutesJson(): string {
  const slide = {
    title: "Opportunity",
    bullets: ["Brand-led growth", "Clear ICP"],
    notes: "Speaker notes",
    layout: "content_bullets",
    visualCue: "Brand palette wash",
  };
  const deckSlides = () =>
    Array.from({ length: 6 }, (_, i) => ({
      ...slide,
      title: `Slide ${i + 1}`,
    }));
  return JSON.stringify({
    routes: [
      {
        title: "Heritage",
        description: "Warm story for DiVastra",
        deckTitle: "DiVastra Heritage",
        deckSubtitle: "Craft & Colour",
        slides: deckSlides(),
      },
      {
        title: "Modern",
        description: "Digital-first pitch",
        deckTitle: "DiVastra Modern",
        deckSubtitle: "Scale",
        slides: deckSlides(),
      },
      {
        title: "Bold",
        description: "High-contrast launch",
        deckTitle: "DiVastra Bold",
        deckSubtitle: "Launch",
        slides: deckSlides(),
      },
    ],
  });
}

/** Emit schema-valid JSON when response_format json_schema is present. */
function simulatedStructuredContent(
  request: ProviderExecutionRequest
): string | undefined {
  const rf = request.payload?.response_format as
    | { type?: string; json_schema?: { name?: string; schema?: Record<string, unknown> } }
    | undefined;
  if (!rf || rf.type !== "json_schema") return undefined;
  const schema = rf.json_schema?.schema;
  const name = (rf.json_schema?.name ?? "response").toLowerCase();

  if (name === "presentationrouteconcepts") {
    return simulatedPresentationRouteConceptsJson();
  }
  if (name === "presentationroutes") {
    return simulatedPresentationRoutesJson();
  }
  if (name === "presentationplan") {
    const routes = JSON.parse(simulatedPresentationRoutesJson()) as {
      routes: Array<Record<string, unknown>>;
    };
    const first = routes.routes[0]!;
    return JSON.stringify({
      title: first.deckTitle,
      subtitle: first.deckSubtitle,
      slides: first.slides,
    });
  }

  // Launch-plan shaped schema (M10.7 product UX).
  if (
    schema &&
    typeof schema === "object" &&
    schema.properties &&
    typeof schema.properties === "object" &&
    "title" in (schema.properties as object) &&
    "steps" in (schema.properties as object)
  ) {
    return JSON.stringify({
      title: "Launch plan",
      summary: "Simulated campaign plan after tool approval.",
      steps: [
        { title: "Draft", description: "Save draft record via approved tool." },
        { title: "Review", description: "Validate messaging and assets." },
        { title: "Ready", description: "Prepare for publish (deferred)." },
      ],
    });
  }
  if (
    schema &&
    typeof schema === "object" &&
    schema.properties &&
    typeof schema.properties === "object" &&
    "campaignId" in (schema.properties as object)
  ) {
    return JSON.stringify({
      campaignId: "camp_demo",
      name: "Winter Launch",
      status: "active",
    });
  }
  return JSON.stringify({
    name,
    ok: true,
    note: "Simulated structured output",
  });
}

/** Deterministic presentation-safe text for ControllableDispatcher (no network). */
export function simulatedProviderContent(
  request: ProviderExecutionRequest
): string {
  const capabilityId = String(request.capabilityId ?? "text.generate");
  const payload = request.payload ?? {};
  const prompt =
    (typeof payload.prompt === "string" && payload.prompt) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.input === "string" && payload.input) ||
    (typeof payload.rawPrompt === "string" && payload.rawPrompt) ||
    "your brief";
  const preview = prompt.trim().slice(0, 120);
  switch (capabilityId) {
    case "text.generate":
    case "text.chat":
      return `Simulated creative copy for: ${preview}`;
    case "reasoning.analyze":
      return `Simulated reasoning analysis for: ${preview}`;
    case "vision.analyze":
      return `Simulated vision analysis for: ${preview}`;
    case "embedding.generate":
      return `Simulated embedding metadata for: ${preview}`;
    case "audio.synthesize":
      return `Simulated TTS placeholder for: ${preview}`;
    case "audio.transcribe":
      return `Simulated transcript for: ${preview}`;
    case "image.generate":
      return `Simulated image generation acknowledged for: ${preview}`;
    case "video.generate":
      return `Simulated video generation acknowledged for: ${preview}`;
    default:
      return `Simulated ${capabilityId} result for: ${preview}`;
  }
}

export function sampleExecutionContext(
  overrides: Partial<ProviderExecutionContext> = {}
): ProviderExecutionContext {
  return {
    executionId: asExecutionId("exec_1"),
    organizationId: asOrganizationId("org_1"),
    workspaceId: asWorkspaceId("ws_1"),
    providerId: asProviderId("provider-a"),
    planId: "plan_1",
    correlationId: "corr_1",
    ...overrides,
  };
}

export interface SampleRequestOverrides {
  readonly requestId?: string;
  readonly streaming?: boolean;
  readonly priority?: number;
  readonly retryPolicy?: RetryPolicy;
  readonly timeoutPolicy?: TimeoutPolicy;
  readonly providerId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

let requestCounter = 0;

export function sampleRequest(
  overrides: SampleRequestOverrides = {}
): ProviderExecutionRequest {
  requestCounter += 1;
  const providerId = asProviderId(overrides.providerId ?? "provider-a");
  return {
    requestId: overrides.requestId ?? `preq_${requestCounter}`,
    context: sampleExecutionContext({ providerId }),
    capabilityId: asCapabilityId("analyzeBrief"),
    providerId,
    modelId: "model-x",
    payload: overrides.payload ?? { prompt: "hello" },
    retryPolicy:
      overrides.retryPolicy ?? { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
    timeoutPolicy: overrides.timeoutPolicy ?? { executionTimeoutMs: 1_000 },
    streaming: overrides.streaming ?? false,
    priority: overrides.priority ?? 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
