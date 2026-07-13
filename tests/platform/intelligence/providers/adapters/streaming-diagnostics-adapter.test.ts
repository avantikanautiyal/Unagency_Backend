import {
  FakeTextAdapter,
  fixedNow,
  makeManifest,
  TEST_ADAPTER_ID,
} from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { DefaultStreamingAdapter } from "../../../../../src/platform/intelligence/providers/adapters/streaming/default-streaming-adapter";
import { DefaultProviderDiagnostics } from "../../../../../src/platform/intelligence/providers/adapters/diagnostics/default-provider-diagnostics";

const unwrap = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw r.error;
  return r.value as T;
};

describe("Streaming adapter", () => {
  const streaming = new DefaultStreamingAdapter(fixedNow, (p) => `${p}_x`);

  it("opens a stream, normalizes chunks, heartbeats, and closes", () => {
    const session = unwrap(streaming.openStream("r1", TEST_ADAPTER_ID));
    expect(session.active).toBe(true);
    expect(session.chunks[0]?.kind).toBe("start");

    const chunk = unwrap(streaming.normalizeChunk({ content: "a" }, session));
    expect(chunk.kind).toBe("chunk");
    expect(chunk.done).toBe(false);

    const end = unwrap(streaming.normalizeChunk({ done: true }, session));
    expect(end.kind).toBe("end");
    expect(end.done).toBe(true);

    const heartbeat = unwrap(streaming.heartbeat(session));
    expect(heartbeat.kind).toBe("heartbeat");

    const closed = unwrap(streaming.closeStream(session));
    expect(closed.active).toBe(false);
    expect(closed.chunks.at(-1)?.kind).toBe("end");
  });

  it("rejects chunk normalization on an inactive session", () => {
    const session = unwrap(streaming.openStream("r2", TEST_ADAPTER_ID));
    const closed = unwrap(streaming.closeStream(session));
    const result = streaming.normalizeChunk({ content: "x" }, closed);
    expect(result.ok).toBe(false);
  });
});

describe("Diagnostics", () => {
  const diagnostics = new DefaultProviderDiagnostics(undefined, fixedNow);

  it("produces a compatibility report for supported features", () => {
    const adapter = new FakeTextAdapter();
    const report = diagnostics.compatibilityReport(adapter.describe(), {
      modelId: "test-model",
      features: ["streaming"],
    });
    expect(report.compatible).toBe(true);
  });

  it("reports unsupported features and missing capabilities", () => {
    const adapter = new FakeTextAdapter();
    const report = diagnostics.compatibilityReport(adapter.describe(), {
      modelId: "test-model",
      features: ["vision"],
      capabilities: ["image.generate"],
    });
    expect(report.compatible).toBe(false);
    expect(report.unsupportedFeatures).toContain("vision");
    expect(report.missingCapabilities).toContain("image.generate");
  });

  it("summarizes health from lifecycle state", () => {
    const adapter = new FakeTextAdapter();
    const summary = diagnostics.healthSummary(adapter.describe());
    expect(summary.healthy).toBe(true);
    expect(summary.state).toBe("ready");
  });
});

describe("Abstract provider adapter", () => {
  it("describes, validates, normalizes, and reports health", () => {
    const adapter = new FakeTextAdapter();

    const descriptor = adapter.describe();
    expect(descriptor.metadata.category).toBe("text");
    expect(descriptor.supportedFeatures).toContain("streaming");

    const health = adapter.health();
    if (!health.ok) throw health.error;
    expect(health.value.healthy).toBe(true);

    const error = adapter.translateError({ status: 401 });
    expect(error.kind).toBe("authentication");
  });

  it("derives coarse manifest features from model capabilities", () => {
    const manifest = makeManifest();
    expect(manifest.features.streaming).toBe(true);
    expect(manifest.features.toolCalling).toBe(true);
    expect(manifest.features.vision).toBe(false);
  });
});
