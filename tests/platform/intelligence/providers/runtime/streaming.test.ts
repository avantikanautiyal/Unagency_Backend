import {
  StreamingRuntime,
  StreamingAccumulator,
} from "../../../../../src/platform/intelligence/providers/runtime/streaming/streaming-runtime";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import type { StreamingChunk } from "../../../../../src/platform/intelligence/providers/runtime/contracts/streaming";

function chunk(sequence: number, done = false): StreamingChunk {
  return {
    sessionId: "s1",
    requestId: "r1",
    sequence,
    data: { value: sequence },
    done,
    receivedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("StreamingAccumulator", () => {
  it("accumulates and aggregates chunks in order", () => {
    const acc = new StreamingAccumulator();
    acc.add(chunk(1));
    acc.add(chunk(0));
    acc.add(chunk(2, true));
    const aggregate = acc.aggregate();
    expect(aggregate.chunkCount).toBe(3);
    expect(Array.isArray(aggregate.chunks)).toBe(true);
  });
});

describe("StreamingRuntime", () => {
  it("opens, pushes, and closes a streaming session", () => {
    const runtime = new StreamingRuntime(() => "2026-01-01T00:00:00.000Z");
    const request = sampleRequest({ streaming: true });
    const session = runtime.open(request, "s1");
    expect(session.active).toBe(true);

    expect(runtime.push("s1", chunk(0)).ok).toBe(true);
    const closed = runtime.close("s1");
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.value.active).toBe(false);
      expect(closed.value.chunks.length).toBe(1);
      expect(closed.value.completedAt).toBeDefined();
    }
  });

  it("rejects pushing to a closed session", () => {
    const runtime = new StreamingRuntime();
    const request = sampleRequest({ streaming: true });
    runtime.open(request, "s1");
    runtime.close("s1");
    expect(runtime.push("s1", chunk(0)).ok).toBe(false);
  });

  it("fails on unknown session", () => {
    const runtime = new StreamingRuntime();
    expect(runtime.get("missing").ok).toBe(false);
  });
});
