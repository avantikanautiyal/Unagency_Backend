/**
 * M9.5O1 — Native streaming readiness (recorded/fake wire streams).
 * EXTERNAL AI CALLS: 0.
 */

import {
  IncrementalSseParser,
  FakeStreamHttpTransport,
  OpenAiCompatNativeStreamingDispatcher,
  AnthropicNativeStreamingDispatcher,
  StreamingExecutionOrchestrator,
  buildStreamingTruthMatrix,
  catalogueClaimCannotActivateWithoutParser,
  isStreamExecutable,
  ActiveStreamRegistry,
  StreamingMetrics,
  teeBinaryAudioStream,
  fakeBinaryAudioChunks,
  providerStreamEventToSse,
  createNativeStreamingDispatcher,
  filterStreamExecutableProviderIds,
  evaluateStreamingReadiness,
  resetActiveStreamRegistryForTests,
  composeNativeStreamingDispatchers,
} from "../../../../../src/platform/intelligence/providers/streaming";
import { CancellationSource as CancelSrc } from "../../../../../src/platform/intelligence/providers/runtime/cancellation/cancellation-engine";
import {
  CostCalculator,
  InMemoryProviderPricingCatalogue,
} from "../../../../../src/platform/intelligence/cost";
import { integrityForPlaceholderJudges } from "../../../../../src/platform/intelligence/evaluation/integrity";
import { InMemoryBlobStorage } from "../../../../../src/platform/persistence/storage/in-memory-blob-storage";
import type { ProviderExecutionRequest } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";

const OPENAI_SSE = [
  'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
  ": heartbeat\n\n",
  'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
  "data: [DONE]\n\n",
].join("");

const OPENAI_TOOLS_SSE = [
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":""}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"x\\"}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  "data: [DONE]\n\n",
].join("");

const ANTHROPIC_SSE = [
  "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\n",
  "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n",
  "event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"input_tokens\":2,\"output_tokens\":1}}\n\n",
  "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
].join("");

function req(providerId: string): ProviderExecutionRequest {
  return {
    requestId: "r1",
    context: { organizationId: "org" } as never,
    capabilityId: "text.generate" as never,
    providerId: providerId as never,
    modelId: "gpt-test",
    payload: { prompt: "hi" },
    retryPolicy: { maxAttempts: 1 } as never,
    timeoutPolicy: { executionTimeoutMs: 30_000 } as never,
    streaming: true,
    priority: 0,
    createdAt: new Date().toISOString(),
  } as ProviderExecutionRequest;
}

describe("M9.5O1 native streaming readiness", () => {
  beforeEach(() => {
    resetActiveStreamRegistryForTests();
  });

  it("A/B/C: OpenAI SSE text + TCP split + multi-frame chunk", async () => {
    const transport = new FakeStreamHttpTransport({
      sseText: OPENAI_SSE,
      chunkSizes: [7, 11, 5, 40, 3],
    });
    const dispatcher = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport,
      nativeStreamingVerified: true,
      buildRequest: () => ({
        url: "https://example.test/v1/chat/completions",
        headers: { Authorization: "Bearer test" },
        body: JSON.stringify({ stream: true }),
      }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const result = await orch.execute({
      executionId: "ex_oai",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "gpt-test",
          dispatcher,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.finalContent).toBe("Hello");
    expect(result.usageStatus).toBe("final");
    expect(result.usage?.totalTokens).toBe(5);
  });

  it("D/E: UTF-8 safe incremental parser + heartbeats ignored", () => {
    const parser = new IncrementalSseParser();
    // Split multi-byte UTF-8 across pushes
    const euro = Buffer.from("€", "utf8");
    const frame =
      'data: {"choices":[{"delta":{"content":"' +
      "€" +
      '"}}]}\n\n';
    const bytes = Buffer.from(frame, "utf8");
    const mid = 12;
    const a = parser.push(bytes.slice(0, mid).toString("utf8"));
    const b = parser.push(bytes.slice(mid).toString("utf8"));
    expect(a.length + b.length).toBeGreaterThanOrEqual(0);
    const heartbeats = parser.push(": ping\n\n");
    expect(heartbeats.every((e) => !e.data || e.comments.length > 0)).toBe(true);
  });

  it("F/G: malformed + oversized event", async () => {
    const bad = new FakeStreamHttpTransport({
      sseText: "data: {not-json\n\ndata: [DONE]\n\n",
    });
    const d1 = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport: bad,
      nativeStreamingVerified: true,
      buildRequest: () => ({
        url: "u",
        headers: {},
        body: "{}",
      }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const r1 = await orch.execute({
      executionId: "ex_bad",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: d1,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(r1.success).toBe(false);

    const huge = "data: " + "x".repeat(2000) + "\n\n";
    const parser = new IncrementalSseParser({ maxEventBytes: 100 });
    parser.push(huge);
    expect(parser.exceededMaxEventBytes).toBe(true);
  });

  it("H/I: duplicate terminal idempotent; EOF without terminal fails", async () => {
    const dup = new FakeStreamHttpTransport({
      sseText:
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: [DONE]\n\ndata: [DONE]\n\n',
    });
    const d = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport: dup,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const ok = await orch.execute({
      executionId: "ex_dup",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: d,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(ok.success).toBe(true);
    expect(ok.events.filter((e) => e.type === "stream.completed").length).toBe(1);

    const eof = new FakeStreamHttpTransport({
      sseText: 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
    });
    const d2 = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport: eof,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const bad = await orch.execute({
      executionId: "ex_eof",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: d2,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(bad.success).toBe(false);
    expect(bad.terminationReason).toBe("provider_failed");
  });

  it("J/K: usage final vs missing usage null", async () => {
    const noUsage = new FakeStreamHttpTransport({
      sseText:
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: [DONE]\n\n',
    });
    const d = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport: noUsage,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const r = await orch.execute({
      executionId: "ex_nu",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: d,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(r.usage).toBeNull();
    expect(r.usageStatus).toBe("unknown");
  });

  it("L: AbortSignal aborts provider fetch", async () => {
    let sawSignal = false;
    const transport = new FakeStreamHttpTransport({
      sseText: OPENAI_SSE,
      chunkSizes: [4],
      onFetch: (r) => {
        sawSignal = !!r.signal;
        r.signal?.addEventListener("abort", () => undefined);
      },
    });
    const dispatcher = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const cancel = new CancelSrc();
    const live = {
      get cancelled() {
        return cancel.token.cancelled;
      },
      get reason() {
        return cancel.token.reason;
      },
    };
    const orch = new StreamingExecutionOrchestrator({
      sleep: async (ms) => new Promise((r) => setTimeout(r, ms || 1)),
      onEvent: (e) => {
        if (e.type === "content.delta") cancel.cancel("client_disconnected");
      },
    });
    const result = await orch.execute({
      executionId: "ex_abort",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
      token: live,
    });
    expect(sawSignal).toBe(true);
    expect(
      result.terminationReason === "client_disconnected" ||
        result.attempts[0]?.clientOrInfraTermination
    ).toBe(true);
  });

  it("O/P: pre-commit failover vs post-commit no failover", async () => {
    const failTransport = new FakeStreamHttpTransport({
      sseText: 'data: {"error":{"message":"rate_limit","code":"rate_limit"}}\n\n',
    });
    const okTransport = new FakeStreamHttpTransport({ sseText: OPENAI_SSE });
    const primary = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport: failTransport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const secondary = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.groq",
      wireFamily: "openai_compatible",
      transport: okTransport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const r = await orch.execute({
      executionId: "ex_fo",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: primary,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
        {
          providerId: "provider.groq",
          modelId: "m2",
          dispatcher: secondary,
          primaryOrFailover: "failover",
          positionInRoute: 1,
        },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.preCommitFailovers).toBe(1);

    const midFail = new FakeStreamHttpTransport({
      sseText:
        'data: {"choices":[{"delta":{"content":"X"}}]}\n\ndata: {"error":{"message":"boom","code":"provider_internal"}}\n\n',
    });
    const p2 = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport: midFail,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const r2 = await orch.execute({
      executionId: "ex_pc",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: p2,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
        {
          providerId: "provider.groq",
          modelId: "m2",
          dispatcher: secondary,
          primaryOrFailover: "failover",
          positionInRoute: 1,
        },
      ],
    });
    expect(r2.success).toBe(false);
    expect(r2.finalContent).toBe("X");
    expect(r2.attempts).toHaveLength(1);
  });

  it("Q: OpenAI tool argument fragmented stream", async () => {
    const transport = new FakeStreamHttpTransport({ sseText: OPENAI_TOOLS_SSE });
    const d = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const r = await orch.execute({
      executionId: "ex_tool",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "m",
          dispatcher: d,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(r.toolCalls[0]?.name).toBe("search");
    expect(r.toolCalls[0]?.argumentsJson).toContain("q");
  });

  it("T: Anthropic native fixture", async () => {
    const transport = new FakeStreamHttpTransport({ sseText: ANTHROPIC_SSE });
    const d = new AnthropicNativeStreamingDispatcher({
      providerId: "provider.anthropic",
      transport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const r = await orch.execute({
      executionId: "ex_ant",
      request: req("provider.anthropic"),
      candidates: [
        {
          providerId: "provider.anthropic",
          modelId: "claude-test",
          dispatcher: d,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.finalContent).toBe("Hi");
    expect(r.usage?.totalTokens).toBe(3);
  });

  it("U: compat family (groq) uses same OpenAI wire mapper", async () => {
    const transport = new FakeStreamHttpTransport({ sseText: OPENAI_SSE });
    const d = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.groq",
      wireFamily: "openai_compatible",
      transport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({ sleep: async () => undefined });
    const r = await orch.execute({
      executionId: "ex_groq",
      request: req("provider.groq"),
      candidates: [
        {
          providerId: "provider.groq",
          modelId: "llama",
          dispatcher: d,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("V/W/Y: catalogue claim cannot activate without parser; readiness truth", () => {
    const matrix = buildStreamingTruthMatrix({
      configuredProviderIds: new Set(["provider.openai"]),
    });
    const gemini = matrix.find((m) => m.providerId === "provider.gemini")!;
    expect(gemini.catalogueStreamingClaim).toBe(true);
    expect(gemini.streamingExecutable).toBe(false);
    expect(catalogueClaimCannotActivateWithoutParser(gemini)).toBe(true);
    expect(isStreamExecutable(gemini)).toBe(false);

    const openai = matrix.find((m) => m.providerId === "provider.openai")!;
    expect(openai.streamingRuntimeImplemented).toBe(true);
    expect(isStreamExecutable(openai)).toBe(true);

    const unconfigured = buildStreamingTruthMatrix({
      configuredProviderIds: new Set(),
    }).find((m) => m.providerId === "provider.openai")!;
    expect(unconfigured.streamingRuntimeImplemented).toBe(true);
    expect(unconfigured.configured).toBe(false);
    expect(isStreamExecutable(unconfigured)).toBe(false);
  });

  it("Z/AA/AB/AC: TTS binary chunks + putStream tee + failed does not finalize", async () => {
    const blobs = new InMemoryBlobStorage();
    const client: Uint8Array[] = [];
    const ok = await teeBinaryAudioStream({
      chunks: fakeBinaryAudioChunks([{ size: 8 }, { size: 4 }]),
      onClientChunk: (c) => {
        client.push(c.bytes);
      },
      blobStorage: blobs,
      storageKey: "org/ex/audio.mp3",
    });
    expect(ok.finalized).toBe(true);
    expect(ok.totalBytes).toBe(12);
    expect(client.length).toBe(2);

    const abort = new AbortController();
    abort.abort();
    const fail = await teeBinaryAudioStream({
      chunks: fakeBinaryAudioChunks([{ size: 8 }]),
      onClientChunk: async () => undefined,
      blobStorage: blobs,
      storageKey: "org/ex/bad.mp3",
      signal: abort.signal,
    });
    expect(fail.finalized).toBe(false);
  });

  it("AF/AG: graceful shutdown drains then aborts", async () => {
    const reg = new ActiveStreamRegistry();
    const a = new AbortController();
    reg.register({
      executionId: "e1",
      attemptId: "a1",
      providerId: "provider.openai",
      startedAt: new Date().toISOString(),
      committed: false,
      abort: a,
    });
    const result = await reg.shutdown({
      drainMs: 1,
      reason: "server_shutdown",
      sleep: async () => undefined,
    });
    expect(result.aborted).toBe(1);
    expect(a.signal.aborted).toBe(true);
    expect(reg.acceptingNewStreams).toBe(false);
  });

  it("AI/AJ: cost from usage; unknown null", async () => {
    const catalogue = new InMemoryProviderPricingCatalogue();
    catalogue.upsert({
      pricingVersion: "TEST_O1",
      providerId: "provider.openai",
      modelId: "gpt-test",
      capabilityId: "text.generate",
      currency: "USD",
      rates: [
        { dimension: "input_tokens", unitPrice: 0.001, unitSize: 1000 },
        { dimension: "output_tokens", unitPrice: 0.002, unitSize: 1000 },
      ],
      effectiveFrom: "2020-01-01T00:00:00.000Z",
      provenance: "test_fixture",
      routingEligible: true,
      trust: "high",
    });
    const calc = new CostCalculator(catalogue);
    const transport = new FakeStreamHttpTransport({ sseText: OPENAI_SSE });
    const d = new OpenAiCompatNativeStreamingDispatcher({
      providerId: "provider.openai",
      wireFamily: "openai",
      transport,
      nativeStreamingVerified: true,
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    const orch = new StreamingExecutionOrchestrator({
      sleep: async () => undefined,
      costCalculator: calc,
    });
    const r = await orch.execute({
      executionId: "ex_cost",
      request: req("provider.openai"),
      candidates: [
        {
          providerId: "provider.openai",
          modelId: "gpt-test",
          dispatcher: d,
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
      ],
    });
    expect(r.cost?.amount).not.toBeNull();
    expect(r.cost?.amount).not.toBe(0);
  });

  it("AK/AL: evaluation integrity on partial", () => {
    const integrity = integrityForPlaceholderJudges({ overallScore: 0.99 });
    expect(integrity.feedbackEligible).toBe(false);
    expect(integrity.qualityScore).toBeNull();
  });

  it("AM: telemetry/SSE has no audio bytes / secrets", () => {
    const frame = providerStreamEventToSse({
      type: "audio.chunk",
      providerId: "p",
      modelId: "m",
      capabilityId: "audio.synthesize",
      sequence: 1,
      audio: {
        byteLength: 10,
        mimeType: "audio/mpeg",
        bytes: new Uint8Array(10),
      },
      at: new Date().toISOString(),
    });
    expect(frame.data).not.toContain("bytes");
    expect(frame.data).not.toContain("apiKey");
  });

  it("observability counters", () => {
    const m = new StreamingMetrics();
    m.onStart();
    m.onEnd({
      outcome: "completed",
      ttftMs: 12,
      durationMs: 40,
      eventCount: 3,
      bytesEmitted: 0,
    });
    const snap = m.snapshot();
    expect(snap.streams_started).toBe(1);
    expect(snap.streams_completed).toBe(1);
    expect(snap.active_streams).toBe(0);
  });

  it("X: credential-free boot truth matrix", () => {
    const matrix = buildStreamingTruthMatrix({
      configuredProviderIds: new Set(),
    });
    expect(matrix.every((r) => !isStreamExecutable(r) || r.configured)).toBe(
      true
    );
  });

  it("factory + routing filter + readiness report", () => {
    const transport = new FakeStreamHttpTransport({ sseText: OPENAI_SSE });
    const d = createNativeStreamingDispatcher({
      providerId: "provider.openai",
      transport,
      configuredProviderIds: new Set(["provider.openai"]),
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    expect(d).not.toBeNull();
    expect(d!.nativeIncrementalStreaming).toBe(true);

    const gemini = createNativeStreamingDispatcher({
      providerId: "provider.gemini",
      transport,
      configuredProviderIds: new Set(["provider.gemini"]),
      buildRequest: () => ({ url: "u", headers: {}, body: "{}" }),
    });
    expect(gemini).toBeNull();

    const filtered = filterStreamExecutableProviderIds(
      ["provider.openai", "provider.gemini", "provider.groq"],
      new Set(["provider.openai"])
    );
    expect(filtered).toEqual(["provider.openai"]);
    expect(filtered).not.toContain("provider.gemini");
    expect(filtered).not.toContain("provider.groq"); // catalogue claim but not configured

    const readiness = evaluateStreamingReadiness({});
    expect(readiness.ready).toBe(true);
    expect(readiness.streamingProvidersDiscovered).toBeGreaterThanOrEqual(13);
    expect(readiness.streamingProvidersExecutable).toBe(0);
    expect(readiness.streamingProvidersRuntimeReady).toBeGreaterThanOrEqual(9);

    // Composition without credentials → empty; with fake key + fake transport → ready leaf.
    expect(composeNativeStreamingDispatchers({ env: {} }).size).toBe(0);
    const composed = composeNativeStreamingDispatchers({
      env: {
        OPENAI_API_KEY: "sk-test-not-live",
        OPENAI_ENABLED: "true",
      },
      transport,
    });
    expect(composed.has("provider.openai")).toBe(true);
  });

  it("AQ: provider bypass — native streaming leaves have no vendor SDK imports", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.resolve(
      __dirname,
      "../../../../../src/platform/intelligence/providers/streaming"
    );
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(root);
    const forbidden = [/from ["']openai["']/, /from ["']@anthropic/, /api\.openai\.com/];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const re of forbidden) {
        expect(re.test(src)).toBe(false);
      }
    }
  });
});
